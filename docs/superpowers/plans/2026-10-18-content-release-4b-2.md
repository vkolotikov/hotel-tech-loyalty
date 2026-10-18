# HexaTech Content — Release 4b, Plan 2: the Portal for Approvals, Comments and the "For you" Bell; Release Checks; Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the portal half of release 4b "the team" (spec §6–§8) on Plan 4B-1's server, prove the whole release with the spec's checks, and deploy it after the owner's "yes, deploy".

**Architecture:**
- **One data layer:** `lib/types.ts`, `lib/api.ts`, `lib/errors.ts` and `lib/planCache.ts` learn the server's new fields, calls and refusals; a new `lib/approval.ts` holds the rule as the portal sees it (`approvalsOn`, `staffLocked`, `statusChoices`, `cardFlags`, `flagWords`) so every screen asks one place.
- **The screens:** the Brand page gets an Approvals section; the panel gets a review bar at its top (Written by, Waiting for approval / Sent back, Send for approval / Approve / Send back) and "Comments and history" at its foot; cards on the Plan, the Ideas board and the Posts page get their flags; what staff may not do while approvals are on is hidden (status list, Mark ready / Mark published, the board's Ready column).
- **The bell:** a "For you" button in the Content header on the shared menu (`ui/PopMenu.tsx`, which learns an empty line, marked lines and an open/close callback); its count read every 60 s and when the tab comes back, its list read when opened and then marked seen up to that read.
- **Then** the runbook, the release checks (every PHP folder, the frontend suites, the build, Appointments pixel for pixel, a browser pass as a manager and as a staff member, Lighthouse, eyes) and the deploy by the source-patch recipe.

**Tech Stack:** React 19 + TypeScript + Vite, TanStack Query, react-i18next (five bundles), Tailwind tokens (`a-*`, `c-*`), vitest in node with `renderToStaticMarkup`; Laravel 13 / PHP 8.4.20 for the checks; Playwright (headless shell) and Lighthouse 13.5 for the browser checks.

**Spec:** `docs/superpowers/specs/2026-10-16-content-release-4-design.md` (approved 2026-10-16), §6–§11 (4b). The server half is Plan `docs/superpowers/plans/2026-10-18-content-release-4b-1.md` (built, reviewed and fixed; feature tip `aa641b648`).

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `aa641b648` plus this plan's commit. Production is release 4a: prod main `4c7514ca4` = the source of feature tip `55b0f750f` + a build. The server endpoints this plan uses (all under `/api/v1/admin/content`, `?brand_id=` as today):
- `POST posts/{id}/send-for-approval`, `POST posts/{id}/approve` (`updated_at`), `POST posts/{id}/send-back` (`note`) → `{post}` with `timeline`; refusals `needs_approval` 403, `approvals_off` 409, `wrong_status` 409 (with `post`), `changed_elsewhere` 409 (with `post`), `manager_only` 403, `not_found` 404, `invalid` 422.
- `POST posts/{id}/comments` (`body`) → 201 `{comment, comments_count}`; `PUT comments/{id}` → `{comment}`; `DELETE comments/{id}` → `{deleted, comments_count}`; refusals `not_yours` 403, `not_found` 404, `invalid` 422.
- `GET inbox` → `{items, count, read_at}`; `GET inbox/count` → `{count}`; `POST inbox/seen` (`at`) → `{count}`.
- `GET posts/{id}` → `post.author`, `post.timeline`; every card (plan, ideas, posts, find, the detail) → `comments_count`, `sent_back`; the bootstrap's and the brand's `profile.requires_approval`; `PUT brand/profile` takes `requires_approval` (managers).
- A save, Mark ready, Mark published or a board move that sets Approved, Ready or Published for staff while approvals are on answers 403 `needs_approval`.

**The owner's three open questions (not answered when this plan was written): the plan keeps the server as built.**
1. A deactivated team member keeps their name on comments and history; "Former team member" shows only when the user row is gone. The portal shows whatever `user` the server sends.
2. "Sent back" ends on any change to the post (also a quality check or a new image).
3. Send for approval on a post already in review records the step again on the server; **the portal does not offer the button on a post in review** (the "Waiting for approval" chip says it waits), so a nudge cannot happen from the portal.
If the owner rules otherwise before Task 10, the change is made test-first on the server or the portal and ledgered.

## Global Constraints

- **Branch:** never push the feature branch; never commit its built `frontend/dist`, `public/spa` or `resources/spa-shell`. Only Task 10 pushes, and only after the owner's explicit "yes, deploy" in this conversation (release 4a's yes does not carry over).
- **Ledger and tools:** `$R4C` = `/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2` (every command below writes the full path or sets `R4C=` first). Task 1, Step 1 sets it up with `vt.sh` (vitest on paths, honest exit code), `words.mjs` (locale keys inserted into the five bundles without reformatting them, from a JSON spec), `php.sh` (each PHP path alone, honest exit code) and `extract.mjs` (copies a plan code block into a file: `node $R4C/extract.mjs $R4C/task-N-brief.md "<line naming the file>" <path>`) from 4A-2's archive.
- **Frontend commands** (Git Bash): types `cd frontend && npx tsc -b`; tests `$R4C/vt.sh <paths…>` (paths relative to `frontend/`); scoped lint `cd frontend && npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts`.
- **Baselines** (Task 1, Step 1 measures them again and ledgers them): the full vitest run has exactly 3 failures (`src/lib/plannerMeta.test.ts`); the scoped lint has exactly 17 errors (`src/App.tsx` 1, `src/components/Layout.tsx` 15, `src/pages/hubs/MarketingHub.tsx` 1). Anything else is ours.
- **Tests cannot click** (`vitest.config.ts`: node environment, no jsdom). Every click rule lives in a pure helper with its own test; components are rendered with `renderToStaticMarkup` and checked by their markup. A static render cannot open a menu: the menu's list is its own component (`PopList`) so tests render it directly. Static markup escapes `'` as `&#x27;`: English words the tests look for use the typographic `’`.
- **Types:** every new field on a type that literal test fixtures build (`PostCard`, `PostDetail`, `Bootstrap['profile']`, `BrandProfile`) is optional, so the fixtures still compile.
- **Words:** every new literal `content.*` key in all five bundles (`frontend/src/content/i18n/content.{en,ru,de,fr,es}.json`), inserted with `cd /c/wamp64/www/Hexa-Tech-content && node $R4C/words.mjs $R4C/tN-words.json` from a JSON spec the plan gives (keys from the bundle root, each with `en`, `ru`, `de`, `fr`, `es`), written with the Write tool. Never a heredoc for a bundle. Keys built at run time go into `FAMILIES` in `content/i18n/contentLocales.test.ts`; a word holding a count puts the number where no noun follows it (`COUNTED` in the same test). `src/i18n/localeCompleteness.test.ts` checks every literal `content.*` key in all five bundles.
- **Refusals:** a new family in `lib/errors.ts` (`ERRORS`) must deep-equal `en.<family>.error` (`errors.test.ts`); the portal's own sentence for every refusal; the server's message is never shown.
- **Portal rules (`content/tokens.test.ts`):** nothing imported from `src/appointments`; no bare `hover:-translate-*`; no text under 12 px; stylesheet rules scoped under `[data-content]`; only `a-*` / `c-*` colour classes (this plan uses `text-a-accent-text`, `border-a-accent-text`, `text-a-danger`, `bg-a-danger/10`, `bg-a-accent`, `bg-a-accent/10`, `text-a-accent-ink`, `bg-a-surface-2`, `text-a-text-2`, all already in use).
- **React lint:** no synchronous `setState` inside an effect; no `ref.current` read during render; no component defined inside another; a component file exports components only (helpers live in `*.ts` files — fast refresh).
- **Appointments and the shared workspace core (`src/appointments`, `src/workspace`) do not change in this plan:** the release checks expect `46 screens, 0 differ`.
- **PHP:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by folder, in the foreground (`$R4C/php.sh <paths…>`); never a bare `php artisan test`. Any `artisan tinker` call gets `< /dev/null` (with a file it waits on an open stdin).
- **Escapes:** shell heredocs collapse `\\` and turn `\b` into a backspace — write code holding backslashes with the Write or Edit tool (or `extract.mjs`), never a heredoc, `sed` or `node -e`.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A portal that has not heard of the switch yet:** a staff member's tab read the bootstrap before a manager switched approvals on (it is read again every 5 minutes), so it still offers Mark ready, the whole status list and the Ready column; the server refuses with `needs_approval` — the person reads the rule in the portal's words on a save, an action and a board move, never "Please try again".
   - Pinned by Task 1's `errors.test.ts` case (`save`, `action`, `idea` and `approval` all word `needs_approval`).
2. **Approving words that changed:** a manager presses Approve on a post someone edited after the panel opened — the server refuses (`changed_elsewhere`, with the post); the panel shows the post as it now is and says to read it again; nothing is approved.
   - Pinned by Task 1's api test (Approve sends the `updated_at` the panel holds) and Task 5's `afterRefusal` test.
3. **A comment that cannot go:** nothing but spaces, more than 2,000 characters (counted as characters, emoji included), or the Enter that ends an input-method composition — nothing is sent, and the limit is named.
   - Pinned by Task 6's `timelineMath.test.ts` (`commentProblem`, `sendsOnEnter`).
4. **The bell with nothing, too much, or a failure:** at zero no badge and "Nothing new for you."; past 99 "99+"; a list that fails to load says so — never an empty box.
   - Pinned by Task 7's `bellMath.test.ts` and `popMenu.test.tsx`.
5. **People who are not there:** a removed member's comment or step reads "Former team member" in the timeline and the bell; an AI post shows no "Written by", and a waiting AI post names nobody in the bell.
   - Pinned by Task 5's review bar test, Task 6's timeline test and Task 7's `bellItems` test.

---

## File map

- **Task 1 (the data layer):** `frontend/src/content/lib/types.ts`, `lib/api.ts`, `lib/errors.ts`, `lib/planCache.ts`; new `lib/approval.ts`; tests `lib/api.test.ts`, `lib/errors.test.ts`, `lib/planCache.test.ts`, new `lib/approval.test.ts`; words (refusal families).
- **Task 2 (Brand → Approvals):** new `brand/sections/Approvals.tsx`; `brand/BrandPage.tsx`; test new `brand/approvalsSection.test.tsx`; words.
- **Task 3 (what staff may not do):** `panel/PostPanel.tsx` (status list), `panel/PostActions.tsx`, `ideas/ideasMath.ts`, `ideas/IdeaCard.tsx`, `ideas/IdeaColumn.tsx`, `ideas/IdeasPage.tsx`; tests `panel/postActions.test.tsx`, `panel/PostPanel.test.tsx`, `ideas/ideasMath.test.ts`; words.
- **Task 4 (card flags):** new `ui/CardFlags.tsx`; `lib/approval.ts` (`flagWords`), `plan/PostCardView.tsx`, `ideas/IdeaCard.tsx`, `posts/PostRow.tsx`; tests new `ui/cardFlags.test.tsx`, `lib/approval.test.ts`, `i18n/contentLocales.test.ts`; words.
- **Task 5 (the review bar):** new `panel/reviewMath.ts`, new `panel/ReviewBar.tsx`; `panel/PostPanel.tsx`; tests new `panel/reviewMath.test.ts`, new `panel/reviewBar.test.tsx`; words.
- **Task 6 (comments and history):** new `panel/timelineMath.ts`, new `panel/Timeline.tsx`; `panel/PostPanel.tsx`; tests new `panel/timelineMath.test.ts`, new `panel/timeline.test.tsx`, `panel/PostPanel.test.tsx`, `i18n/contentLocales.test.ts`; words.
- **Task 7 (the bell):** `ui/PopMenu.tsx`; new `bell/bellMath.ts`, new `bell/ForYouBell.tsx`; `ContentShell.tsx`; tests new `ui/popMenu.test.tsx`, new `bell/bellMath.test.ts`, new `bell/forYouBell.test.tsx`, `ContentShell.test.tsx`, `i18n/contentLocales.test.ts`; words.
- **Task 8 (runbook):** `docs/content-workspace.md`.
- **Task 9 (release checks):** files under `$R4C` only (seed/unseed, the browser pass, Lighthouse), plus test-first fixes of any defect found.
- **Task 10 (deploy):** a temporary deploy worktree on branch `deploy/content-r4b`.

---

### Task 1: The data layer — types, calls, refusal words, the panel's cache, the rule as the portal sees it

**Files:**
- Modify: `frontend/src/content/lib/types.ts`, `frontend/src/content/lib/api.ts`, `frontend/src/content/lib/errors.ts`, `frontend/src/content/lib/planCache.ts`
- Create: `frontend/src/content/lib/approval.ts`
- Test: modify `frontend/src/content/lib/api.test.ts`, `frontend/src/content/lib/errors.test.ts`, `frontend/src/content/lib/planCache.test.ts`; create `frontend/src/content/lib/approval.test.ts`
- Words: `$R4C/t1-words.json` (the refusal families `approval`, `comment`, `inbox`, and `needs_approval` in `save`, `action`, `idea`)

**Interfaces:**
- Produces (types): `Person {id, name}`; `EventKind`; `TimelineComment {type:'comment', id, user: Person|null, body, edited, mine, at}`; `TimelineEvent {type:'event', id, kind: EventKind, user, note, at}`; `TimelineItem`; `InboxKind = 'waiting'|'approved'|'sent_back'|'comment'`; `InboxItem {id: string, kind, post: Pick<PostCard,'id'|'platform'|'title'|'hook'|'topic'|'scheduled_date'>|null, by: Person|null, note: string|null, at, unread}`; `InboxPayload {items, count, read_at}`; optional `PostCard.comments_count`, `PostCard.sent_back`, `PostDetail.author`, `PostDetail.timeline`, `Bootstrap['profile'].requires_approval`, `BrandProfile.requires_approval`.
- Produces (calls on `contentApi(brand)`): `sendForApproval(id)`, `approve(id, updatedAt)`, `sendBack(id, note)` → `{post: PostDetail}`; `addComment(postId, body)` → `{comment, comments_count}`; `editComment(id, body)` → `{comment}`; `deleteComment(id)` → `{deleted, comments_count}`; `inbox()` → `InboxPayload`; `inboxCount()` → `{count}`; `inboxSeen(at: string|null)` → `{count}`.
- Produces (refusals): families `approval`, `comment`, `inbox`; `needs_approval` in `save`, `action`, `idea`.
- Produces (cache): `cardOf` carries `comments_count` and `sent_back`; `keepTimeline(fresh, old): PostDetail`; `refreshLists` also marks `['content', brand, 'inbox']`.
- Produces (`lib/approval.ts`): `MANAGER_STATUSES`, `SEND_FROM` (`idea`, `draft`, `needs_visual`), `approvalsOn(boot)`, `staffLocked(boot)`, `statusChoices(statuses, locked, current)`, `cardFlags(post, on)` → `{waiting, sentBack, comments}`, `type Translate`.

- [ ] **Step 1: Set up the ledger and measure the baselines**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R4C=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-18-content-release-4b-2.md)
A=.superpowers/sdd/archive/2026-10-16-content-release-4a-2
cp "$A/vt.sh" "$A/words.mjs" "$A/php.sh" "$A/extract.mjs" "$R4C/" && chmod +x "$R4C/vt.sh" "$R4C/php.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-18-content-release-4b-2.md" > "$R4C/progress.md"
echo "$R4C"; ls "$R4C"
cd frontend && npx vitest run > "$R4C/base-vitest.txt" 2>&1; tail -5 "$R4C/base-vitest.txt"; grep -E '^ FAIL ' "$R4C/base-vitest.txt" | sed 's/ >.*//' | sort -u
npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: `$R4C` ends in `.superpowers/sdd/2026-10-18-content-release-4b-2`; the listing shows `extract.mjs php.sh plan-path progress.md vt.sh words.mjs`; vitest `Tests  3 failed | … passed` with the only `FAIL` file `src/lib/plannerMeta.test.ts`; lint `✖ 17 problems (17 errors, 0 warnings)`. Ledger: `Task 1: note: baselines — vitest <n> passed + 3 plannerMeta; lint 17`. If either baseline differs, ledger the new numbers and use them from here on.

- [ ] **Step 2: Write the failing tests**

Write `frontend/src/content/lib/approval.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import type { Bootstrap, PostStatus } from './types'
import { approvalsOn, cardFlags, staffLocked, statusChoices } from './approval'

const boot = (requires: boolean | undefined, manager: boolean) => ({
  profile: { id: 1, setup_completed: true, readiness: 80, requires_approval: requires },
  staff: { name: 'Sam', role: manager ? 'manager' : 'staff', can_manage: manager },
}) as unknown as Bootstrap
const ALL: PostStatus[] = ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived']

describe('approvals as the portal sees them (spec 2026-10-16 §6)', () => {
  it('are on only when the bootstrap says so', () => {
    expect(approvalsOn(boot(true, false))).toBe(true)
    expect(approvalsOn(boot(false, false))).toBe(false)
    expect(approvalsOn(boot(undefined, false))).toBe(false)
    expect(approvalsOn(undefined)).toBe(false)
  })

  it('lock staff, and only while they are on', () => {
    expect(staffLocked(boot(true, false))).toBe(true)
    expect(staffLocked(boot(true, true))).toBe(false)
    expect(staffLocked(boot(false, false))).toBe(false)
  })

  it('take Approved, Ready and Published out of a locked status list, keeping the post’s own status', () => {
    expect(statusChoices(ALL, true, 'draft')).toEqual(['idea', 'draft', 'needs_review', 'needs_visual', 'skipped', 'archived'])
    expect(statusChoices(ALL, true, 'approved')).toEqual(['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'skipped', 'archived'])
    expect(statusChoices(ALL, false, 'draft')).toEqual(ALL)
  })

  it('flag a card waiting for approval only while on, a sent-back draft, and its comments', () => {
    expect(cardFlags({ status: 'needs_review', sent_back: false, comments_count: 2 }, true)).toEqual({ waiting: true, sentBack: false, comments: 2 })
    expect(cardFlags({ status: 'needs_review' }, false)).toEqual({ waiting: false, sentBack: false, comments: 0 })
    expect(cardFlags({ status: 'draft', sent_back: true }, true)).toEqual({ waiting: false, sentBack: true, comments: 0 })
  })
})
```

Append this block at the end of `frontend/src/content/lib/api.test.ts` (after its last `})`), with the Edit tool:

```ts
describe('release 4b calls (spec 2026-10-16 §6–§8)', () => {
  it('sends the approval steps, the comments and the bell under the prefix; Approve sends the version the panel holds', async () => {
    calls.fail = null
    const api = contentApi(5)
    await api.sendForApproval(9)
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts/9/send-for-approval?brand_id=5' })
    await api.approve(9, '2026-10-05T06:00:00.000000Z')
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts/9/approve?brand_id=5', body: { updated_at: '2026-10-05T06:00:00.000000Z' } })
    await api.sendBack(9, 'Shorter, please.')
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts/9/send-back?brand_id=5', body: { note: 'Shorter, please.' } })
    await api.addComment(9, 'Love it')
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts/9/comments?brand_id=5', body: { body: 'Love it' } })
    await api.editComment(4, 'Edited')
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/comments/4?brand_id=5', body: { body: 'Edited' } })
    await api.deleteComment(4)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/comments/4?brand_id=5' })
    await api.inbox()
    expect(last()).toMatchObject({ method: 'get', url: '/v1/admin/content/inbox?brand_id=5' })
    await api.inboxCount()
    expect(last()).toMatchObject({ method: 'get', url: '/v1/admin/content/inbox/count?brand_id=5' })
    await api.inboxSeen('2026-10-05T06:00:00.000000Z')
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/inbox/seen?brand_id=5', body: { at: '2026-10-05T06:00:00.000000Z' } })
    await api.inboxSeen(null)
    expect(last().body).toEqual({})
  })
})
```

Append this block at the end of `frontend/src/content/lib/errors.test.ts`, with the Edit tool:

```ts
// Review Focus 1: a tab that has not heard of the switch meets the rule on a save, an action or a board move.
describe('release 4b refusals', () => {
  it('words the approval rule wherever a staff write meets it, and the approval, comment and bell refusals', () => {
    const rule = 'Only a manager can approve posts while approvals are on for this brand.'
    for (const family of ['save', 'action', 'idea', 'approval'] as const) {
      expect(errorKey(family, 'needs_approval')).toEqual([`content.${family}.error.needs_approval`, rule])
    }
    expect(errorKey('approval', 'changed_elsewhere')[1]).toBe('Someone changed this post since you opened it. Read it again before approving.')
    expect(errorKey('comment', 'not_yours')).toEqual(['content.comment.error.not_yours', 'You can only change your own comments.'])
    expect(errorKey('comment', 'too_long')[1]).toBe('A comment holds at most 2,000 characters.')
    expect(errorKey('inbox', 'network')).toEqual(['content.inbox.error.unknown', 'The list could not be loaded. Please try again.'])
  })
})
```

In `frontend/src/content/lib/planCache.test.ts`, replace:

```ts
import { cardOf, placePost, refreshLists } from './planCache'
```

with:

```ts
import { cardOf, keepTimeline, placePost, refreshLists } from './planCache'
```

replace:

```ts
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['content', 3, 'plan'], ['content', 3, 'posts'], ['content', 3, 'goals'], ['content', 3, 'ideas']])
```

with:

```ts
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['content', 3, 'plan'], ['content', 3, 'posts'], ['content', 3, 'goals'], ['content', 3, 'ideas'], ['content', 3, 'inbox']])
```

and append at the end of the file:

```ts
describe('release 4b: what the panel keeps', () => {
  it('carries a post’s comment count and "sent back" onto its card', () => {
    const detail = { ...card(5, '2026-10-07'), comments_count: 3, sent_back: true, language: 'en' } as unknown as PostDetail
    expect(cardOf(detail)).toEqual(card(5, '2026-10-07', { comments_count: 3, sent_back: true }))
  })

  it('keeps the timeline already read when an answer brings the post without one', () => {
    const timeline = [{ type: 'comment', id: 1, user: null, body: 'Hi', edited: false, mine: false, at: '2026-10-05T06:00:00.000000Z' }] as PostDetail['timeline']
    const old = { ...card(5, '2026-10-07'), timeline } as unknown as PostDetail
    const fresh = { ...card(5, '2026-10-08') } as unknown as PostDetail
    expect(keepTimeline(fresh, old).timeline).toBe(timeline)
    expect(keepTimeline(fresh, old).scheduled_date).toBe('2026-10-08')
    expect(keepTimeline({ ...fresh, timeline: [] }, old).timeline).toEqual([])
    expect(keepTimeline(fresh, { ...old, id: 6 }).timeline).toBeUndefined()
    expect(keepTimeline(fresh, undefined)).toBe(fresh)
  })
})
```

- [ ] **Step 3: Run them to see them fail**

```bash
/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2/vt.sh src/content/lib/approval.test.ts src/content/lib/api.test.ts src/content/lib/errors.test.ts src/content/lib/planCache.test.ts
```

Expected: failures — `./approval` cannot be resolved; `api.sendForApproval is not a function`; `content.save.error.unknown` where `needs_approval` is expected; `keepTimeline` is not exported; `refreshLists` marks four keys, not five.

- [ ] **Step 4: Types, calls, refusals, cache, the rule**

In `frontend/src/content/lib/types.ts`:

1. Replace:

```ts
  profile: { id: number; setup_completed: boolean; readiness: number } | null
```

with:

```ts
  /** `requires_approval`: the brand's posts need a manager's approval (spec 2026-10-16 §6.1). */
  profile: { id: number; setup_completed: boolean; readiness: number; requires_approval?: boolean } | null
```

2. Replace:

```ts
  image_url: string | null
  updated_at: string
}

export interface VisualBrief {
```

with:

```ts
  image_url: string | null
  updated_at: string
  /** Spec 2026-10-16 §7.1: its comments, counted. */
  comments_count?: number
  /** Spec §6.3: a draft whose latest approval step sent it back, with no change to the post since. */
  sent_back?: boolean
}

export interface VisualBrief {
```

3. Replace:

```ts
  series_id?: number | null
  series?: Series | null
}
```

with:

```ts
  series_id?: number | null
  series?: Series | null
  /** Who wrote it (spec 2026-10-16 §7.1): null for a post the AI or a repeat made, or whose writer left. */
  author?: string | null
  /** Its comments and approval steps, oldest first, the newest 200 (`GET posts/{id}` and the approval steps send it). */
  timeline?: TimelineItem[]
}
```

4. Replace:

```ts
  holiday_country?: string | null
  /** Marketing and industry days on the Plan (default on). */
  marketing_days?: boolean
```

with:

```ts
  holiday_country?: string | null
  /** Marketing and industry days on the Plan (default on). */
  marketing_days?: boolean
  /** Spec 2026-10-16 §6.1: posts need a manager's approval (default off, managers switch it). */
  requires_approval?: boolean
```

5. Append at the end of the file:

```ts

/** Someone on the team as the timeline and the bell name them; null in their place when they have left (spec 2026-10-16 §7.1). */
export interface Person { id: number; name: string }
/** An approval step (spec §6.4). */
export type EventKind = 'sent_for_approval' | 'approved' | 'sent_back' | 'changed_after_approval'
export interface TimelineComment { type: 'comment'; id: number; user: Person | null; body: string; edited: boolean; mine: boolean; at: string }
export interface TimelineEvent { type: 'event'; id: number; kind: EventKind; user: Person | null; note: string | null; at: string }
export type TimelineItem = TimelineComment | TimelineEvent

/** One line of the "For you" list (spec §8): what waits for this manager, or news since they last looked. */
export type InboxKind = 'waiting' | 'approved' | 'sent_back' | 'comment'
export interface InboxItem {
  id: string
  kind: InboxKind
  post: Pick<PostCard, 'id' | 'platform' | 'title' | 'hook' | 'topic' | 'scheduled_date'> | null
  /** Who acted or commented; for a waiting post, its writer. */
  by: Person | null
  /** A send-back's note or a comment, cut to 200 characters. */
  note: string | null
  at: string
  unread: boolean
}
/** `GET inbox`: the newest 50, everything counted, and when it was read ("seen" goes up to that). */
export interface InboxPayload { items: InboxItem[]; count: number; read_at: string }
```

In `frontend/src/content/lib/api.ts`:

1. Replace:

```ts
  RepeatEvery, Rewrite, Snippet, SnippetKind, SnippetSuggestion, StrategyDetail, StrategySummary, Template, TemplateFields, TemplateSuggestion,
  Variation, VoiceFields,
} from './types'
```

with:

```ts
  RepeatEvery, Rewrite, Snippet, SnippetKind, SnippetSuggestion, StrategyDetail, StrategySummary, Template, TemplateFields, TemplateSuggestion,
  TimelineComment, Variation, VoiceFields, InboxPayload,
} from './types'
```

2. Replace:

```ts
    stopRepeat: (id: number): Promise<{ removed: number; post: PostDetail | null }> => watched(api.delete(url(`posts/${id}/repeat`))),
```

with:

```ts
    stopRepeat: (id: number): Promise<{ removed: number; post: PostDetail | null }> => watched(api.delete(url(`posts/${id}/repeat`))),
    /** The approval steps (spec 2026-10-16 §6.2): each answers the post with its timeline. Approve sends the version the manager read. */
    sendForApproval: (id: number): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/send-for-approval`))),
    approve: (id: number, updatedAt: string): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/approve`), { updated_at: updatedAt })),
    sendBack: (id: number, note: string): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/send-back`), { note })),
    /** Comments (spec §7.1): each answers the comment as the timeline shows it, and the post's comment count. */
    addComment: (postId: number, body: string): Promise<{ comment: TimelineComment; comments_count: number }> =>
      watched(api.post(url(`posts/${postId}/comments`), { body })),
    editComment: (id: number, body: string): Promise<{ comment: TimelineComment }> => watched(api.put(url(`comments/${id}`), { body })),
    deleteComment: (id: number): Promise<{ deleted: boolean; comments_count: number }> => watched(api.delete(url(`comments/${id}`))),
    /** The "For you" bell (spec §8): its list with when it was read, its count, and "seen" up to that read (now when none). */
    inbox: (): Promise<InboxPayload> => watched(api.get(url('inbox'))),
    inboxCount: (): Promise<{ count: number }> => watched(api.get(url('inbox/count'))),
    inboxSeen: (at: string | null): Promise<{ count: number }> => watched(api.post(url('inbox/seen'), at === null ? {} : { at })),
```

In `frontend/src/content/lib/errors.ts`:

1. Replace:

```ts
  save: {
    published_cannot_move: 'A published post keeps the date it went out.',
```

with:

```ts
  save: {
    needs_approval: 'Only a manager can approve posts while approvals are on for this brand.',
    published_cannot_move: 'A published post keeps the date it went out.',
```

2. Replace:

```ts
  action: {
    invalid: 'Check the link and try again.',
```

with:

```ts
  action: {
    needs_approval: 'Only a manager can approve posts while approvals are on for this brand.',
    invalid: 'Check the link and try again.',
```

3. Replace:

```ts
  idea: {
    invalid: 'Write the idea first.',
```

with:

```ts
  idea: {
    needs_approval: 'Only a manager can approve posts while approvals are on for this brand.',
    invalid: 'Write the idea first.',
```

4. Replace:

```ts
    ai_failed: 'The AI could not suggest templates. Please try again.',
    unknown: 'The template could not be saved. Please try again.',
  },
} as const
```

with:

```ts
    ai_failed: 'The AI could not suggest templates. Please try again.',
    unknown: 'The template could not be saved. Please try again.',
  },
  // Release 4b (spec 2026-10-16 §6–§8). `invalid` (approval) and `invalid` / `too_long` (comment) are also the portal's
  // own checks, made before anything is sent.
  approval: {
    needs_approval: 'Only a manager can approve posts while approvals are on for this brand.',
    approvals_off: 'Approvals are off for this brand. Reload to see the post as it is.',
    wrong_status: 'This post has moved on since you opened it. The panel now shows it as it is.',
    changed_elsewhere: 'Someone changed this post since you opened it. Read it again before approving.',
    manager_only: 'Only an owner or a manager can approve or send back posts.',
    invalid: 'Say what should change, in at most 2,000 characters.',
    not_found: 'This post no longer exists.',
    unknown: 'That did not work. Please try again.',
  },
  comment: {
    invalid: 'Write the comment first.',
    too_long: 'A comment holds at most 2,000 characters.',
    not_yours: 'You can only change your own comments.',
    not_found: 'This comment no longer exists.',
    unknown: 'The comment could not be saved. Please try again.',
  },
  inbox: {
    unknown: 'The list could not be loaded. Please try again.',
  },
} as const
```

In `frontend/src/content/lib/planCache.ts`:

1. Replace:

```ts
export function cardOf(post: PostDetail): PostCard {
  const { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at } = post
  return { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at }
}
```

with:

```ts
export function cardOf(post: PostDetail): PostCard {
  const { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back } = post
  return { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back }
}

/** A post an answer brought without its timeline (a save, an AI answer) keeps the one already read (spec 2026-10-16 §7.1). */
export function keepTimeline(fresh: PostDetail, old: PostDetail | undefined): PostDetail {
  return fresh.timeline === undefined && old?.id === fresh.id && old.timeline !== undefined ? { ...fresh, timeline: old.timeline } : fresh
}
```

2. Replace:

```ts
    // The Ideas board (spec 2026-10-16 §4) holds the posts without a day: a change can move a card.
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'ideas'] }),
  ])
```

with:

```ts
    // The Ideas board (spec 2026-10-16 §4) holds the posts without a day: a change can move a card.
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'ideas'] }),
    // The bell (spec §8): a post that enters or leaves review, an approval step or a comment changes what it says.
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'inbox'] }),
  ])
```

Write `frontend/src/content/lib/approval.ts` with the Write tool:

```ts
import type { Bootstrap, PostCard, PostStatus } from './types'

/** The bundles' words with a fallback, as the components hand `t` to a helper. */
export type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

/** What only a manager sets while a brand's approvals are on (the server's ContentApproval::MANAGER_STATUSES). */
export const MANAGER_STATUSES: readonly PostStatus[] = ['approved', 'ready_to_publish', 'published']

/**
 * What the panel offers "Send for approval" from (spec 2026-10-16 §6.2). The server also takes Needs review, which
 * records the step again; the portal does not offer it there — the post already says it waits.
 */
export const SEND_FROM: readonly PostStatus[] = ['idea', 'draft', 'needs_visual']

/** The brand's approvals are on (the bootstrap says so; an answer without the field means off). */
export const approvalsOn = (boot: Pick<Bootstrap, 'profile'> | undefined): boolean => boot?.profile?.requires_approval === true

/** Staff while the brand's approvals are on: the portal hides what the server would refuse them (spec §6.2). */
export const staffLocked = (boot: Pick<Bootstrap, 'profile' | 'staff'> | undefined): boolean => approvalsOn(boot) && boot?.staff.can_manage !== true

/** The status list: without the three manager statuses while locked — the post's own status stays, so the list can show it. */
export function statusChoices(statuses: readonly PostStatus[], locked: boolean, current: PostStatus): PostStatus[] {
  return locked ? statuses.filter(s => !MANAGER_STATUSES.includes(s) || s === current) : [...statuses]
}

/** What a card shows beside its status (spec §6.3, §7.1): waiting for approval (only while on), sent back, its comments. */
export function cardFlags(post: Pick<PostCard, 'status' | 'sent_back' | 'comments_count'>, on: boolean): { waiting: boolean; sentBack: boolean; comments: number } {
  return { waiting: on && post.status === 'needs_review', sentBack: post.sent_back === true, comments: post.comments_count ?? 0 }
}
```

- [ ] **Step 5: The refusal words in five languages**

Write `$R4C/t1-words.json` with the Write tool:

```json
{
  "save.error.needs_approval": { "en": "Only a manager can approve posts while approvals are on for this brand.", "ru": "Пока для этого бренда включено согласование, одобрять посты может только менеджер.", "de": "Solange für diese Marke Freigaben aktiv sind, kann nur ein Manager Beiträge freigeben.", "fr": "Tant que la validation est activée pour cette marque, seul un responsable peut approuver les publications.", "es": "Mientras la aprobación esté activada para esta marca, solo un responsable puede aprobar publicaciones." },
  "action.error.needs_approval": { "en": "Only a manager can approve posts while approvals are on for this brand.", "ru": "Пока для этого бренда включено согласование, одобрять посты может только менеджер.", "de": "Solange für diese Marke Freigaben aktiv sind, kann nur ein Manager Beiträge freigeben.", "fr": "Tant que la validation est activée pour cette marque, seul un responsable peut approuver les publications.", "es": "Mientras la aprobación esté activada para esta marca, solo un responsable puede aprobar publicaciones." },
  "idea.error.needs_approval": { "en": "Only a manager can approve posts while approvals are on for this brand.", "ru": "Пока для этого бренда включено согласование, одобрять посты может только менеджер.", "de": "Solange für diese Marke Freigaben aktiv sind, kann nur ein Manager Beiträge freigeben.", "fr": "Tant que la validation est activée pour cette marque, seul un responsable peut approuver les publications.", "es": "Mientras la aprobación esté activada para esta marca, solo un responsable puede aprobar publicaciones." },
  "approval.error.needs_approval": { "en": "Only a manager can approve posts while approvals are on for this brand.", "ru": "Пока для этого бренда включено согласование, одобрять посты может только менеджер.", "de": "Solange für diese Marke Freigaben aktiv sind, kann nur ein Manager Beiträge freigeben.", "fr": "Tant que la validation est activée pour cette marque, seul un responsable peut approuver les publications.", "es": "Mientras la aprobación esté activada para esta marca, solo un responsable puede aprobar publicaciones." },
  "approval.error.approvals_off": { "en": "Approvals are off for this brand. Reload to see the post as it is.", "ru": "Согласование для этого бренда выключено. Обновите страницу, чтобы увидеть пост в текущем виде.", "de": "Freigaben sind für diese Marke ausgeschaltet. Laden Sie neu, um den Beitrag im aktuellen Stand zu sehen.", "fr": "La validation est désactivée pour cette marque. Rechargez pour voir la publication telle qu’elle est.", "es": "La aprobación está desactivada para esta marca. Recarga para ver la publicación tal como está." },
  "approval.error.wrong_status": { "en": "This post has moved on since you opened it. The panel now shows it as it is.", "ru": "Пока пост был открыт, его статус изменился. Сейчас панель показывает его текущий вид.", "de": "Dieser Beitrag hat sich geändert, seit Sie ihn geöffnet haben. Das Panel zeigt jetzt den aktuellen Stand.", "fr": "Cette publication a changé depuis que vous l’avez ouverte. Le panneau la montre maintenant telle qu’elle est.", "es": "Esta publicación ha cambiado desde que la abriste. El panel ahora la muestra tal como está." },
  "approval.error.changed_elsewhere": { "en": "Someone changed this post since you opened it. Read it again before approving.", "ru": "Кто-то изменил пост, пока он был открыт. Прочитайте его ещё раз, прежде чем одобрить.", "de": "Jemand hat diesen Beitrag geändert, seit Sie ihn geöffnet haben. Lesen Sie ihn vor der Freigabe noch einmal.", "fr": "Quelqu’un a modifié cette publication depuis que vous l’avez ouverte. Relisez-la avant de l’approuver.", "es": "Alguien ha cambiado esta publicación desde que la abriste. Vuelve a leerla antes de aprobarla." },
  "approval.error.manager_only": { "en": "Only an owner or a manager can approve or send back posts.", "ru": "Одобрять и возвращать посты может только владелец или менеджер.", "de": "Nur Inhaber oder Manager können Beiträge freigeben oder zurückschicken.", "fr": "Seul un propriétaire ou un responsable peut approuver ou renvoyer des publications.", "es": "Solo un propietario o un responsable puede aprobar o devolver publicaciones." },
  "approval.error.invalid": { "en": "Say what should change, in at most 2,000 characters.", "ru": "Напишите, что нужно изменить, — не больше 2000 символов.", "de": "Schreiben Sie, was sich ändern soll, in höchstens 2.000 Zeichen.", "fr": "Indiquez ce qui doit changer, en 2 000 caractères au plus.", "es": "Indica qué debe cambiar, en un máximo de 2000 caracteres." },
  "approval.error.not_found": { "en": "This post no longer exists.", "ru": "Этого поста больше нет.", "de": "Diesen Beitrag gibt es nicht mehr.", "fr": "Cette publication n'existe plus.", "es": "Esta publicación ya no existe." },
  "approval.error.unknown": { "en": "That did not work. Please try again.", "ru": "Не получилось. Попробуйте ещё раз.", "de": "Das hat nicht geklappt. Bitte versuchen Sie es erneut.", "fr": "Cela n'a pas fonctionné. Veuillez réessayer.", "es": "No funcionó. Inténtalo de nuevo." },
  "comment.error.invalid": { "en": "Write the comment first.", "ru": "Сначала напишите комментарий.", "de": "Schreiben Sie zuerst den Kommentar.", "fr": "Écrivez d’abord le commentaire.", "es": "Escribe primero el comentario." },
  "comment.error.too_long": { "en": "A comment holds at most 2,000 characters.", "ru": "Комментарий может быть не длиннее 2000 символов.", "de": "Ein Kommentar hat höchstens 2.000 Zeichen.", "fr": "Un commentaire compte au plus 2 000 caractères.", "es": "Un comentario tiene como máximo 2000 caracteres." },
  "comment.error.not_yours": { "en": "You can only change your own comments.", "ru": "Менять можно только свои комментарии.", "de": "Sie können nur Ihre eigenen Kommentare ändern.", "fr": "Vous ne pouvez modifier que vos propres commentaires.", "es": "Solo puedes cambiar tus propios comentarios." },
  "comment.error.not_found": { "en": "This comment no longer exists.", "ru": "Этого комментария больше нет.", "de": "Diesen Kommentar gibt es nicht mehr.", "fr": "Ce commentaire n’existe plus.", "es": "Este comentario ya no existe." },
  "comment.error.unknown": { "en": "The comment could not be saved. Please try again.", "ru": "Не удалось сохранить комментарий. Попробуйте ещё раз.", "de": "Der Kommentar konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", "fr": "Le commentaire n’a pas pu être enregistré. Veuillez réessayer.", "es": "No se pudo guardar el comentario. Inténtalo de nuevo." },
  "inbox.error.unknown": { "en": "The list could not be loaded. Please try again.", "ru": "Не удалось загрузить список. Попробуйте ещё раз.", "de": "Die Liste konnte nicht geladen werden. Bitte versuchen Sie es erneut.", "fr": "La liste n’a pas pu être chargée. Veuillez réessayer.", "es": "No se pudo cargar la lista. Inténtalo de nuevo." }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node .superpowers/sdd/2026-10-18-content-release-4b-2/words.mjs .superpowers/sdd/2026-10-18-content-release-4b-2/t1-words.json
```

Expected: no "different words" stop; `git diff --stat frontend/src/content/i18n` lists the five bundles.

- [ ] **Step 6: Run the tests, the types and the bundle checks**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
"$R4C/vt.sh" src/content/lib src/content/i18n src/i18n/localeCompleteness.test.ts && (cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN)
```

Expected: every file passes (`Test Files … passed`), `TSC-CLEAN`.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/lib frontend/src/content/i18n && git commit -q -m "Content portal: types, calls, refusal words and the approval rule for release 4b" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && git status --short
```

Expected: one commit; a clean status.

---

### Task 2: Brand → Approvals (spec §6.1)

**Files:**
- Create: `frontend/src/content/brand/sections/Approvals.tsx`
- Modify: `frontend/src/content/brand/BrandPage.tsx`
- Test: create `frontend/src/content/brand/approvalsSection.test.tsx`
- Words: `$R4C/t2-words.json`

**Interfaces:**
- Consumes: `useBrand().saveProfile` (`brand/useBrand.ts`, it adopts the answer and reads the bootstrap again); `BrandProfile.requires_approval` (Task 1); the `brand` refusal family; `brandWith`, `profile`, `renderBrand` (`brand/brandTesting.tsx`).
- Produces: `ApprovalsSection({ brand, canEdit })` on the Brand page after Key dates; switching marks the bell's reads (`['content', brand, 'inbox']`) for a new read.

- [ ] **Step 1: Write the failing test**

Write `frontend/src/content/brand/approvalsSection.test.tsx` with the Write tool:

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
import { ApprovalsSection } from './sections/Approvals'

const on = brandWith({ profile: { ...profile, requires_approval: true } })

describe('Brand → Approvals (spec 2026-10-16 §6.1)', () => {
  it('gives a manager the switch, off by default, and says what each position means', () => {
    const off = brandWith()
    const html = renderBrand(off, true, <ApprovalsSection brand={off} canEdit />)
    expect(html).toContain('Approvals')
    expect(html).toMatch(/role="switch" aria-checked="false"/)
    expect(html).toContain('Posts need a manager’s approval')
    expect(html).toContain('Off: everyone can mark posts ready and published.')
    const html2 = renderBrand(on, true, <ApprovalsSection brand={on} canEdit />)
    expect(html2).toMatch(/role="switch" aria-checked="true"/)
    expect(html2).toContain('On: staff write, edit and send posts for approval; only managers approve, mark ready and publish.')
  })

  it('shows staff the position without a switch', () => {
    const html = renderBrand(on, false, <ApprovalsSection brand={on} canEdit={false} />)
    expect(html).not.toContain('role="switch"')
    expect(html).toContain('Posts need a manager’s approval: ')
    expect(html).toContain('>On<')
  })

  it('sits on the Brand page after Key dates', () => {
    const html = renderBrand(brandWith(), true)
    expect(html.indexOf('id="content-approvals"')).toBeGreaterThan(html.indexOf('id="content-keydates"'))
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2/vt.sh src/content/brand/approvalsSection.test.tsx
```

Expected: FAIL — `./sections/Approvals` cannot be resolved.

- [ ] **Step 3: The section, on the page**

Write `frontend/src/content/brand/sections/Approvals.tsx` with the Write tool:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../../workspace/ui/Notice'
import { useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { BrandPayload } from '../../lib/types'
import { useBrand } from '../useBrand'

/**
 * Approvals (spec 2026-10-16 §6.1): whether the brand's posts need a manager's approval — per brand, default off,
 * managers only; everyone reads it. Switching changes no post's status; the bootstrap is read again (useBrand's adopt),
 * so every open page hides or shows what staff may do, and the managers' bell gains or loses its waiting posts.
 */
export function ApprovalsSection({ brand, canEdit }: { brand: BrandPayload; canEdit: boolean }) {
  const { t } = useTranslation()
  const { saveProfile } = useBrand()
  const queryClient = useQueryClient()
  const brandId = useBrandId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.approvals.${key}`, english)
  const on = brand.profile?.requires_approval === true
  const switchLabel = w('switch', 'Posts need a manager’s approval')

  const toggle = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveProfile({ requires_approval: !on })
      void queryClient.invalidateQueries({ queryKey: ['content', brandId, 'inbox'] })
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="content-approvals" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="space-y-0.5">
        <h2 id="content-approvals" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Approvals')}</h2>
        <p className="text-sm text-a-text-2">{w('intro', 'Whether posts wait for a manager’s approval before they are ready.')}</p>
      </div>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <button type="button" role="switch" aria-checked={on} disabled={busy} aria-labelledby="content-approvals-switch" aria-describedby="content-approvals-line"
            onClick={() => { void toggle() }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-a-accent' : 'bg-a-surface-2'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-a-surface shadow-a-sm transition ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
          </button>
          <span id="content-approvals-switch" className="text-sm text-a-text">{switchLabel}</span>
        </div>
      ) : (
        <p className="text-sm">
          <span className="text-a-text-2">{switchLabel}: </span>
          <span className="text-a-text">{on ? t('content.brand.channels.on', 'On') : t('content.brand.channels.off', 'Off')}</span>
        </p>
      )}
      <p id="content-approvals-line" className="text-xs text-a-text-2">
        {on
          ? w('on_line', 'On: staff write, edit and send posts for approval; only managers approve, mark ready and publish.')
          : w('off_line', 'Off: everyone can mark posts ready and published.')}
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
```

In `frontend/src/content/brand/BrandPage.tsx`, replace:

```tsx
import { Readiness } from './Readiness'
```

with:

```tsx
import { Readiness } from './Readiness'
import { ApprovalsSection } from './sections/Approvals'
```

and replace:

```tsx
              <KeyDatesSection brand={brand} canEdit={canEdit} />
```

with:

```tsx
              <KeyDatesSection brand={brand} canEdit={canEdit} />
              <ApprovalsSection brand={brand} canEdit={canEdit} />
```

- [ ] **Step 4: The words**

Write `$R4C/t2-words.json` with the Write tool:

```json
{
  "brand.approvals.title": { "en": "Approvals", "ru": "Согласование", "de": "Freigaben", "fr": "Validation", "es": "Aprobaciones" },
  "brand.approvals.intro": { "en": "Whether posts wait for a manager’s approval before they are ready.", "ru": "Ждут ли посты одобрения менеджера, прежде чем стать готовыми.", "de": "Ob Beiträge auf die Freigabe eines Managers warten, bevor sie bereit sind.", "fr": "Indique si les publications attendent l’approbation d’un responsable avant d’être prêtes.", "es": "Si las publicaciones esperan la aprobación de un responsable antes de estar listas." },
  "brand.approvals.switch": { "en": "Posts need a manager’s approval", "ru": "Посты одобряет менеджер", "de": "Beiträge brauchen die Freigabe eines Managers", "fr": "Les publications doivent être approuvées par un responsable", "es": "Las publicaciones necesitan la aprobación de un responsable" },
  "brand.approvals.on_line": { "en": "On: staff write, edit and send posts for approval; only managers approve, mark ready and publish.", "ru": "Вкл.: сотрудники пишут, редактируют и отправляют посты на согласование; одобряют, отмечают готовыми и публикуют только менеджеры.", "de": "An: Mitarbeitende schreiben, bearbeiten und senden Beiträge zur Freigabe; nur Manager geben frei, markieren als bereit und veröffentlichen.", "fr": "Actif : l’équipe rédige, modifie et soumet les publications à validation ; seuls les responsables approuvent, marquent prêtes et publient.", "es": "Activo: el equipo escribe, edita y envía publicaciones a aprobación; solo los responsables aprueban, marcan como listas y publican." },
  "brand.approvals.off_line": { "en": "Off: everyone can mark posts ready and published.", "ru": "Выкл.: любой может отметить пост готовым или опубликованным.", "de": "Aus: Alle können Beiträge als bereit und veröffentlicht markieren.", "fr": "Inactif : tout le monde peut marquer les publications prêtes et publiées.", "es": "Inactivo: cualquiera puede marcar publicaciones como listas y publicadas." }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node .superpowers/sdd/2026-10-18-content-release-4b-2/words.mjs .superpowers/sdd/2026-10-18-content-release-4b-2/t2-words.json
```

Expected: no "different words" stop.

- [ ] **Step 5: Run the tests**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
"$R4C/vt.sh" src/content/brand src/content/i18n src/i18n/localeCompleteness.test.ts && (cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN)
```

Expected: every file passes (`approvalsSection.test.tsx` 3 tests among them; `brandPage.test.tsx` unchanged); `TSC-CLEAN`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/brand frontend/src/content/i18n && git commit -q -m "Content portal: Brand → Approvals, the per-brand switch (managers)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && git status --short
```

---

### Task 3: What staff may not do while approvals are on — the status list, Mark ready / Mark published, the board's Ready column (spec §6.2)

**Files:**
- Modify: `frontend/src/content/panel/PostPanel.tsx`, `frontend/src/content/panel/PostActions.tsx`, `frontend/src/content/ideas/ideasMath.ts`, `frontend/src/content/ideas/IdeaCard.tsx`, `frontend/src/content/ideas/IdeaColumn.tsx`, `frontend/src/content/ideas/IdeasPage.tsx`
- Test: modify `frontend/src/content/panel/postActions.test.tsx`, `frontend/src/content/panel/PostPanel.test.tsx`, `frontend/src/content/ideas/ideasMath.test.ts`
- Words: `$R4C/t3-words.json`

**Interfaces:**
- Consumes: `staffLocked`, `statusChoices` (Task 1).
- Produces: `ideasMath.canEnter(column, locked): boolean`, `moveTargets(column, locked): IdeasColumn[]`, `stepTarget(column, step, locked): IdeasColumn | null`; `IdeaCard` and `IdeaColumn` take `locked?: boolean` (default false); the word `content.review.staff_hint`.

- [ ] **Step 1: Write the failing tests**

Append at the end of `frontend/src/content/panel/postActions.test.tsx`, with the Edit tool:

```tsx
describe('PostActions while approvals are on (spec 2026-10-16 §6.2)', () => {
  const locked = { ...boot, profile: { id: 1, setup_completed: true, readiness: 80, requires_approval: true } } as unknown as Bootstrap
  const renderAs = (value: Bootstrap, p: PostDetail) => renderToStaticMarkup(
    <ContentContext.Provider value={{ data: value, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <PostActions post={p} dirty={false} onPost={() => {}} onDuplicated={() => {}} onDeleted={() => {}} />
    </ContentContext.Provider>,
  )

  it('hides Mark ready and Mark published from staff, and says who does them', () => {
    const html = renderAs(locked, post)
    expect(html).not.toContain('Mark ready')
    expect(html).not.toContain('Mark published')
    expect(html).toContain('While approvals are on, a manager approves, marks ready and publishes.')
    expect(html).toContain('Duplicate')
  })

  it('keeps them for managers', () => {
    const html = renderAs({ ...locked, staff: { can_manage: true } } as unknown as Bootstrap, post)
    expect(html).toContain('Mark ready')
    expect(html).toContain('Mark published')
    expect(html).not.toContain('While approvals are on')
  })
})
```

Append at the end of `frontend/src/content/panel/PostPanel.test.tsx`, with the Edit tool:

```tsx
describe('PostPanel while approvals are on (spec 2026-10-16 §6.2)', () => {
  it('stops a staff member’s status list before Approved, Ready and Published', () => {
    const lockedBoot = {
      ...boot, statuses: ['idea', 'draft', 'needs_review', 'approved', 'ready_to_publish', 'published'],
      profile: { id: 1, setup_completed: true, readiness: 80, requires_approval: true },
    } as unknown as Bootstrap
    const client = new QueryClient()
    client.setQueryData(['content', 3, 'post', post.id], post)
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ContentContext.Provider value={{ data: lockedBoot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <PanelProvider initial={{ kind: 'post', id: 5, seq: 1 }}><PostPanel /></PanelProvider>
        </ContentContext.Provider>
      </QueryClientProvider>,
    )
    expect(html).toContain('<option value="needs_review">')
    expect(html).not.toContain('<option value="approved">')
    expect(html).not.toContain('<option value="ready_to_publish">')
    expect(html).not.toContain('<option value="published">')
  })
})
```

In `frontend/src/content/ideas/ideasMath.test.ts`, replace:

```ts
import { ageOf, ageText, columnOf, ideaBody, ideaLine, inFlight, moveStatus, placeCard, scheduleDefaults, seeAllLink, stepColumn } from './ideasMath'
```

with:

```ts
import { ageOf, ageText, canEnter, columnOf, ideaBody, ideaLine, inFlight, moveStatus, moveTargets, placeCard, scheduleDefaults, seeAllLink, stepColumn, stepTarget } from './ideasMath'
```

and append at the end of the file:

```ts
describe('approvals on the board (spec 2026-10-16 §6.2)', () => {
  it('keeps staff out of Ready while approvals are on, by drop, by "Move to…" and by Shift + →', () => {
    expect(canEnter('ready', true)).toBe(false)
    expect(canEnter('ready', false)).toBe(true)
    expect(canEnter('review', true)).toBe(true)
    expect(moveTargets('review', true)).toEqual(['idea', 'draft'])
    expect(moveTargets('review', false)).toEqual(['idea', 'draft', 'ready'])
    expect(stepTarget('review', 1, true)).toBeNull()
    expect(stepTarget('review', 1, false)).toBe('ready')
  })

  it('lets a card already in Ready move out', () => {
    expect(moveTargets('ready', true)).toEqual(['idea', 'draft', 'review'])
    expect(stepTarget('ready', -1, true)).toBe('review')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2/vt.sh src/content/panel/postActions.test.tsx src/content/panel/PostPanel.test.tsx src/content/ideas/ideasMath.test.ts
```

Expected: failures — staff still see "Mark ready"; the panel lists `approved`; `canEnter` is not exported.

- [ ] **Step 3: The locks**

In `frontend/src/content/panel/PostPanel.tsx`, replace:

```tsx
import { errorKey } from '../lib/errors'
```

with:

```tsx
import { staffLocked, statusChoices } from '../lib/approval'
import { errorKey } from '../lib/errors'
```

and replace `statuses={boot.statuses}` with `statuses={statusChoices(boot.statuses, staffLocked(boot), editing.base.status)}`.

In `frontend/src/content/panel/PostActions.tsx`:

1. Replace:

```tsx
import { errorKey } from '../lib/errors'
```

with:

```tsx
import { staffLocked } from '../lib/approval'
import { errorKey } from '../lib/errors'
```

2. Replace:

```tsx
 * What can be done with a saved post (spec §4.3): mark it ready, mark it
 * published (with its link), duplicate it, copy its text, delete it (after a
 * confirm). They wait while the post has unsaved edits.
```

with:

```tsx
 * What can be done with a saved post (spec §4.3): mark it ready, mark it
 * published (with its link) — only managers while the brand's approvals are on
 * (spec 2026-10-16 §6.2) — duplicate it, copy its text, delete it (after a
 * confirm). They wait while the post has unsaved edits.
```

3. Replace:

```tsx
  const boot = useBoot()
  const [busy, setBusy] = useState<string | null>(null)
```

with:

```tsx
  const boot = useBoot()
  const locked = staffLocked(boot)
  const [busy, setBusy] = useState<string | null>(null)
```

4. Replace:

```tsx
      {dirty && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      <div className="flex flex-wrap gap-2">
        {post.status !== 'ready_to_publish' && post.status !== 'published' && (
```

with:

```tsx
      {dirty && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      {locked && <p className="text-xs text-a-text-2">{t('content.review.staff_hint', 'While approvals are on, a manager approves, marks ready and publishes.')}</p>}
      <div className="flex flex-wrap gap-2">
        {!locked && post.status !== 'ready_to_publish' && post.status !== 'published' && (
```

5. Replace:

```tsx
        {post.status !== 'published' && (
          <Button size="sm" variant="secondary" disabled={waits} aria-expanded={publishing} onClick={() => setPublishing(p => !p)}>
```

with:

```tsx
        {!locked && post.status !== 'published' && (
          <Button size="sm" variant="secondary" disabled={waits} aria-expanded={publishing} onClick={() => setPublishing(p => !p)}>
```

6. Replace `      {publishing && post.status !== 'published' && (` with `      {!locked && publishing && post.status !== 'published' && (`.

In `frontend/src/content/ideas/ideasMath.ts`, replace:

```ts
export function stepColumn(from: IdeasColumn, step: -1 | 1): IdeasColumn | null {
  return COLUMNS[COLUMNS.indexOf(from) + step] ?? null
}
```

with:

```ts
export function stepColumn(from: IdeasColumn, step: -1 | 1): IdeasColumn | null {
  return COLUMNS[COLUMNS.indexOf(from) + step] ?? null
}

/** Whether a card may enter a stage: staff may not move one into Ready while the brand's approvals are on (spec 2026-10-16 §6.2). */
export const canEnter = (column: IdeasColumn, locked: boolean): boolean => !(locked && column === 'ready')

/** The stages "Move to…" offers a card in `column`. */
export const moveTargets = (column: IdeasColumn, locked: boolean): IdeasColumn[] => COLUMNS.filter(c => c !== column && canEnter(c, locked))

/** The stage Shift + ← / → moves a card to, or null: past either end, or a stage it may not enter. */
export function stepTarget(column: IdeasColumn, step: -1 | 1, locked: boolean): IdeasColumn | null {
  const to = stepColumn(column, step)
  return to !== null && canEnter(to, locked) ? to : null
}
```

In `frontend/src/content/ideas/IdeaCard.tsx`:

1. Replace:

```tsx
import { ageText, COLUMN_TEXT, COLUMNS, IDEAS_HINT_ID, ideaLine, stepColumn } from './ideasMath'
```

with:

```tsx
import { ageText, COLUMN_TEXT, IDEAS_HINT_ID, ideaLine, moveTargets, stepTarget } from './ideasMath'
```

2. Replace:

```tsx
export function IdeaCard({ post, column, locale, now, pillar, draggable, onOpen, onMove, onSchedule, onDragStart, onDragEnd }: {
```

with:

```tsx
export function IdeaCard({ post, column, locale, now, pillar, draggable, locked = false, onOpen, onMove, onSchedule, onDragStart, onDragEnd }: {
```

3. Replace:

```tsx
  pillar: string | null
  draggable: boolean
  onOpen: (id: number) => void
```

with:

```tsx
  pillar: string | null
  draggable: boolean
  /** Staff while the brand's approvals are on: no move into Ready (spec 2026-10-16 §6.2). */
  locked?: boolean
  onOpen: (id: number) => void
```

4. Replace `    const to = stepColumn(column, e.key === 'ArrowLeft' ? -1 : 1)` with `    const to = stepTarget(column, e.key === 'ArrowLeft' ? -1 : 1, locked)`.

5. Replace:

```tsx
          items={COLUMNS.filter(c => c !== column).map(c => ({ id: c, label: t(`content.ideas.column.${c}`, COLUMN_TEXT[c]) }))}
```

with:

```tsx
          items={moveTargets(column, locked).map(c => ({ id: c, label: t(`content.ideas.column.${c}`, COLUMN_TEXT[c]) }))}
```

In `frontend/src/content/ideas/IdeaColumn.tsx`:

1. Replace:

```tsx
export function IdeaColumn({ column, posts, total, seeAll, locale, now, pillarName, draggable, dropping, onOpen, onMove, onSchedule, onDragStart, onDragEnd, onDrop, children }: {
```

with:

```tsx
export function IdeaColumn({ column, posts, total, seeAll, locale, now, pillarName, draggable, locked = false, dropping, onOpen, onMove, onSchedule, onDragStart, onDragEnd, onDrop, children }: {
```

2. Replace:

```tsx
  draggable: boolean
  /** A card from another stage is being dragged: this stage takes the drop. */
```

with:

```tsx
  draggable: boolean
  /** Staff while the brand's approvals are on: its cards offer no move into Ready. */
  locked?: boolean
  /** A card from another stage is being dragged: this stage takes the drop. */
```

3. Replace `              <IdeaCard key={post.id} post={post} column={column} locale={locale} now={now} pillar={pillarName(post.pillar_id)} draggable={draggable}` with `              <IdeaCard key={post.id} post={post} column={column} locale={locale} now={now} pillar={pillarName(post.pillar_id)} draggable={draggable} locked={locked}`.

In `frontend/src/content/ideas/IdeasPage.tsx`:

1. Replace:

```tsx
import { failureOf } from '../lib/api'
```

with:

```tsx
import { failureOf } from '../lib/api'
import { staffLocked } from '../lib/approval'
```

2. Replace `import { COLUMN_TEXT, COLUMNS, columnOf, IDEAS_HINT_ID, inFlight, moveStatus, placeCard, seeAllLink } from './ideasMath'` with `import { canEnter, COLUMN_TEXT, COLUMNS, columnOf, IDEAS_HINT_ID, inFlight, moveStatus, placeCard, seeAllLink } from './ideasMath'`.

3. Replace:

```tsx
  const wide = useMedia('(min-width: 1024px)')
```

with:

```tsx
  const wide = useMedia('(min-width: 1024px)')
  // Spec 2026-10-16 §6.2: while the brand's approvals are on, staff cannot move a card into Ready (the server refuses it).
  const locked = staffLocked(boot)
```

4. Replace:

```tsx
    const status = moveStatus(post, to)
    if (status === null || !moving.start(post.id)) return
```

with:

```tsx
    const status = moveStatus(post, to)
    if (status === null || !canEnter(to, locked) || !moving.start(post.id)) return
```

5. Replace `            draggable={wide} dropping={dragging !== null && columnOf(dragging.status) !== column}` with `            draggable={wide} locked={locked} dropping={dragging !== null && columnOf(dragging.status) !== column && canEnter(column, locked)}`.

Write `$R4C/t3-words.json` with the Write tool:

```json
{
  "review.staff_hint": { "en": "While approvals are on, a manager approves, marks ready and publishes.", "ru": "Пока включено согласование, одобряет, отмечает готовым и публикует менеджер.", "de": "Solange Freigaben aktiv sind, gibt ein Manager frei, markiert als bereit und veröffentlicht.", "fr": "Tant que la validation est active, un responsable approuve, marque prêt et publie.", "es": "Mientras la aprobación esté activada, un responsable aprueba, marca como listo y publica." }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node .superpowers/sdd/2026-10-18-content-release-4b-2/words.mjs .superpowers/sdd/2026-10-18-content-release-4b-2/t3-words.json
```

- [ ] **Step 4: Run the tests**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
"$R4C/vt.sh" src/content/panel src/content/ideas src/content/i18n src/i18n/localeCompleteness.test.ts && (cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN)
```

Expected: every file passes; `TSC-CLEAN`.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/panel frontend/src/content/ideas frontend/src/content/i18n && git commit -q -m "Content portal: hide what staff may not do while approvals are on" -m "The status list stops before Approved, Ready and Published; Mark ready and
Mark published are not offered; the Ideas board's Ready column takes no
drop, no Move to and no Shift + arrow (spec 2026-10-16 §6.2)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && git status --short
```

---

### Task 4: Card flags — Waiting for approval, Sent back, the comment count (spec §6.3, §7.1)

**Files:**
- Create: `frontend/src/content/ui/CardFlags.tsx`
- Modify: `frontend/src/content/lib/approval.ts`, `frontend/src/content/plan/PostCardView.tsx`, `frontend/src/content/ideas/IdeaCard.tsx`, `frontend/src/content/posts/PostRow.tsx`, `frontend/src/content/i18n/contentLocales.test.ts`
- Test: create `frontend/src/content/ui/cardFlags.test.tsx`; modify `frontend/src/content/lib/approval.test.ts`
- Words: `$R4C/t4-words.json`

**Interfaces:**
- Consumes: `approvalsOn`, `cardFlags`, `Translate` (Task 1); `PostCard.comments_count`, `PostCard.sent_back` (Task 1).
- Produces: `flagWords(flags, t): string` in `lib/approval.ts`; `CardFlags({ post, compact? })`; the words `content.flags.waiting`, `content.flags.sent_back`, `content.flags.comments` (used again by Task 5).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/content/lib/approval.test.ts`, replace `import { approvalsOn, cardFlags, staffLocked, statusChoices } from './approval'` with `import { approvalsOn, cardFlags, flagWords, staffLocked, statusChoices } from './approval'`, and append at the end of the file:

```ts
describe('a card’s flags in words', () => {
  it('reads them in order, for the name of a card whose marks are drawn without words', () => {
    const t = (_key: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace('{{count}}', String(vars?.count ?? ''))
    expect(flagWords({ waiting: true, sentBack: false, comments: 2 }, t)).toBe('Waiting for approval, Comments: 2')
    expect(flagWords({ waiting: false, sentBack: true, comments: 0 }, t)).toBe('Sent back')
    expect(flagWords({ waiting: false, sentBack: false, comments: 0 }, t)).toBe('')
  })
})
```

Write `frontend/src/content/ui/cardFlags.test.tsx` with the Write tool:

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
import type { Bootstrap, PostCard } from '../lib/types'
import { PostCardView } from '../plan/PostCardView'
import { PostRow } from '../posts/PostRow'
import { CardFlags } from './CardFlags'

const card = (more: Partial<PostCard> = {}): PostCard => ({
  id: 5, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'needs_review', title: null,
  hook: 'Three colours', topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', ...more,
})
const render = (requires: boolean, element: ReactElement) => renderToStaticMarkup(
  <ContentContext.Provider value={{
    data: { ...bootFor(false), profile: { id: 1, setup_completed: true, readiness: 64, requires_approval: requires } } as Bootstrap,
    isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {},
  }}>
    {element}
  </ContentContext.Provider>,
)

describe('card flags (spec 2026-10-16 §6.3, §7.1)', () => {
  it('say "Waiting for approval" on a post in review only while approvals are on', () => {
    expect(render(true, <CardFlags post={card()} />)).toContain('Waiting for approval')
    expect(render(false, <CardFlags post={card()} />)).toBe('')
  })

  it('say "Sent back" on a sent-back draft, and count comments without reading the number twice', () => {
    const html = render(false, <CardFlags post={card({ status: 'draft', sent_back: true, comments_count: 2 })} />)
    expect(html).toContain('Sent back')
    expect(html).toContain('<span aria-hidden="true">2</span><span class="sr-only">Comments: 2</span>')
  })

  it('draw only the marks on a compact card, each with its words for a screen reader', () => {
    const html = render(true, <CardFlags post={card({ comments_count: 1 })} compact />)
    expect(html).toContain('title="Waiting for approval"')
    expect(html).toContain('<span class="sr-only">Waiting for approval</span>')
    expect(html).not.toContain('rounded-full')
  })

  it('end a Plan card’s name and show on the card, in the month and on a Posts row', () => {
    const html = render(true, <PostCardView post={card({ comments_count: 2 })} onOpen={() => {}} />)
    expect(html).toContain('aria-label="instagram 09:00: Three colours, needs_review, Waiting for approval, Comments: 2"')
    expect(html).toContain('data-flags=""')
    expect(render(true, <PostCardView post={card()} compact onOpen={() => {}} />)).toContain('title="Waiting for approval"')
    expect(render(false, <PostRow post={card({ comments_count: 3 })} locale="en-GB" pillar={null} selected={false} onOpen={() => {}} />)).toContain('Comments: 3')
  })
})
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
    const COUNTED = ['plan.goals.at_risk', 'plan.goals.streak', 'panel.repeat.copies', 'panel.repeat.stop_confirm', 'brand.channels.per_week', 'ideas.see_all', 'panel.blanks']
```

with:

```ts
    const COUNTED = ['plan.goals.at_risk', 'plan.goals.streak', 'panel.repeat.copies', 'panel.repeat.stop_confirm', 'brand.channels.per_week', 'ideas.see_all', 'panel.blanks', 'flags.comments']
```

- [ ] **Step 2: Run them to see them fail**

```bash
/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2/vt.sh src/content/lib/approval.test.ts src/content/ui/cardFlags.test.tsx
```

Expected: failures — `flagWords` is not exported; `./CardFlags` cannot be resolved.

- [ ] **Step 3: The flags, on every card**

In `frontend/src/content/lib/approval.ts`, append:

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

Write `frontend/src/content/ui/CardFlags.tsx` with the Write tool:

```tsx
import { useTranslation } from 'react-i18next'
import { Hourglass, MessageSquare, Undo2 } from 'lucide-react'
import { useContent } from '../ContentProvider'
import { approvalsOn, cardFlags } from '../lib/approval'
import type { PostCard } from '../lib/types'

const CHIP = 'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium'

/**
 * What a card shows beside its status (spec 2026-10-16 §6.3, §7.1): "Waiting for approval" while the brand's approvals
 * are on, "Sent back", and its comment count. Compact (the month, the tray): the marks alone, each with its words for a
 * screen reader. Nothing when there is nothing to say.
 */
export function CardFlags({ post, compact = false }: { post: PostCard; compact?: boolean }) {
  const { t } = useTranslation()
  const { data } = useContent()
  const flags = cardFlags(post, approvalsOn(data))
  if (!flags.waiting && !flags.sentBack && flags.comments === 0) return null
  const waiting = t('content.flags.waiting', 'Waiting for approval')
  const back = t('content.flags.sent_back', 'Sent back')
  const comments = t('content.flags.comments', 'Comments: {{count}}', { count: flags.comments })
  if (compact) {
    return (
      <span data-flags="" className="flex shrink-0 items-center gap-1 text-a-text-2">
        {flags.waiting && <span title={waiting} className="text-a-accent-text"><Hourglass size={12} aria-hidden /><span className="sr-only">{waiting}</span></span>}
        {flags.sentBack && <span title={back} className="text-a-danger"><Undo2 size={12} aria-hidden /><span className="sr-only">{back}</span></span>}
        {flags.comments > 0 && (
          <span title={comments} className="inline-flex items-center gap-0.5 text-xs tabular-nums">
            <MessageSquare size={12} aria-hidden /><span aria-hidden>{flags.comments}</span><span className="sr-only">{comments}</span>
          </span>
        )}
      </span>
    )
  }
  return (
    <span data-flags="" className="flex flex-wrap items-center gap-1">
      {flags.waiting && <span className={`${CHIP} border border-a-accent-text text-a-accent-text`}><Hourglass size={12} aria-hidden />{waiting}</span>}
      {flags.sentBack && <span className={`${CHIP} bg-a-danger/10 text-a-danger`}><Undo2 size={12} aria-hidden />{back}</span>}
      {flags.comments > 0 && (
        <span title={comments} className={`${CHIP} bg-a-surface-2 text-a-text-2 tabular-nums`}>
          <MessageSquare size={12} aria-hidden /><span aria-hidden>{flags.comments}</span><span className="sr-only">{comments}</span>
        </span>
      )}
    </span>
  )
}
```

In `frontend/src/content/plan/PostCardView.tsx`:

1. Replace:

```tsx
import { cardLine } from '../lib/postText'
import type { PostCard } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
```

with:

```tsx
import { useContent } from '../ContentProvider'
import { approvalsOn, cardFlags, flagWords } from '../lib/approval'
import { cardLine } from '../lib/postText'
import type { PostCard } from '../lib/types'
import { CardFlags } from '../ui/CardFlags'
import { PlatformMark } from '../ui/PlatformMark'
```

2. Replace:

```tsx
  const { t } = useTranslation()
  const text = cardLine(post) || t('content.plan.untitled', 'Untitled post')
```

with:

```tsx
  const { t } = useTranslation()
  const { data } = useContent()
  const text = cardLine(post) || t('content.plan.untitled', 'Untitled post')
```

3. Replace:

```tsx
    : t('content.plan.card_label', '{{platform}}: {{text}}, {{status}}', words)
```

with:

```tsx
    : t('content.plan.card_label', '{{platform}}: {{text}}, {{status}}', words)
  // Spec 2026-10-16 §6.3, §7.1: the card's flags end its name (the compact card draws them without words).
  const flags = flagWords(cardFlags(post, approvalsOn(data)), (key, fallback, vars) => t(key, fallback, vars))
```

4. Replace:

```tsx
      aria-label={label} aria-describedby={movable && post.scheduled_date !== null ? MOVE_HINT_ID : undefined} aria-current={selected ? 'true' : undefined}
```

with:

```tsx
      aria-label={flags ? `${label}, ${flags}` : label} aria-describedby={movable && post.scheduled_date !== null ? MOVE_HINT_ID : undefined} aria-current={selected ? 'true' : undefined}
```

5. Replace:

```tsx
          <span className="min-w-0 flex-1 truncate text-sm leading-snug text-a-text">{text}</span>
          <StatusDot status={post.status} />
```

with:

```tsx
          <span className="min-w-0 flex-1 truncate text-sm leading-snug text-a-text">{text}</span>
          <CardFlags post={post} compact />
          <StatusDot status={post.status} />
```

6. Replace:

```tsx
          <span className="line-clamp-3 w-full break-words text-sm leading-snug text-a-text">{text}</span>
```

with:

```tsx
          <span className="line-clamp-3 w-full break-words text-sm leading-snug text-a-text">{text}</span>
          <CardFlags post={post} />
```

In `frontend/src/content/ideas/IdeaCard.tsx`, replace:

```tsx
import { PlatformMark } from '../ui/PlatformMark'
```

with:

```tsx
import { CardFlags } from '../ui/CardFlags'
import { PlatformMark } from '../ui/PlatformMark'
```

and replace:

```tsx
        {(column === 'review' || column === 'ready') && <StatusPill status={post.status} />}
```

with:

```tsx
        {(column === 'review' || column === 'ready') && <StatusPill status={post.status} />}
        <CardFlags post={post} />
```

In `frontend/src/content/posts/PostRow.tsx`, replace:

```tsx
import type { PostCard } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
```

with:

```tsx
import type { PostCard } from '../lib/types'
import { CardFlags } from '../ui/CardFlags'
import { PlatformMark } from '../ui/PlatformMark'
```

and replace:

```tsx
        <span className="block truncate text-xs text-a-text-2">{pillar ? `${day} · ${pillar}` : day}</span>
      </span>
```

with:

```tsx
        <span className="block truncate text-xs text-a-text-2">{pillar ? `${day} · ${pillar}` : day}</span>
        <CardFlags post={post} />
      </span>
```

Write `$R4C/t4-words.json` with the Write tool:

```json
{
  "flags.waiting": { "en": "Waiting for approval", "ru": "Ждёт одобрения", "de": "Wartet auf Freigabe", "fr": "En attente d’approbation", "es": "Pendiente de aprobación" },
  "flags.sent_back": { "en": "Sent back", "ru": "Возвращён", "de": "Zurückgeschickt", "fr": "Renvoyée", "es": "Devuelta" },
  "flags.comments": { "en": "Comments: {{count}}", "ru": "Комментарии: {{count}}", "de": "Kommentare: {{count}}", "fr": "Commentaires : {{count}}", "es": "Comentarios: {{count}}" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node .superpowers/sdd/2026-10-18-content-release-4b-2/words.mjs .superpowers/sdd/2026-10-18-content-release-4b-2/t4-words.json
```

- [ ] **Step 4: Run the tests**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
"$R4C/vt.sh" src/content/lib src/content/ui src/content/plan src/content/ideas src/content/posts src/content/i18n src/content/tokens.test.ts src/i18n/localeCompleteness.test.ts && (cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN)
```

Expected: every file passes (`planPieces.test.tsx` and `PlanPage.test.tsx` unchanged: their cards carry no flags); `TSC-CLEAN`.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/lib frontend/src/content/ui frontend/src/content/plan frontend/src/content/ideas frontend/src/content/posts frontend/src/content/i18n && git commit -q -m "Content portal: cards say Waiting for approval, Sent back, and count comments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && git status --short
```

---

### Task 5: The panel's review bar — Written by, Waiting for approval / Sent back, Send for approval, Approve, Send back (spec §6.2, §6.3, §7.1)

**Files:**
- Create: `frontend/src/content/panel/reviewMath.ts`, `frontend/src/content/panel/ReviewBar.tsx`
- Modify: `frontend/src/content/panel/PostPanel.tsx`
- Test: create `frontend/src/content/panel/reviewMath.test.ts`, `frontend/src/content/panel/reviewBar.test.tsx`
- Words: `$R4C/t5-words.json`

**Interfaces:**
- Consumes: `approvalsOn`, `SEND_FROM` (Task 1); `api.sendForApproval`, `api.approve`, `api.sendBack` (Task 1); the `approval` refusal family (Task 1); `PostDetail.author`, `PostDetail.sent_back` (Task 1); the words `content.flags.waiting`, `content.flags.sent_back` (Task 4); the panel's `adopt` (it shows an answered post and keeps typed edits).
- Produces: `reviewButtons(status, on, manager)` → `{send, approve, sendBack}`; `NOTE_MAX = 2000`; `noteProblem(note): 'invalid' | null`; `afterRefusal(failure)` → `{post, code}`; `ReviewBar({ post, dirty, onPost })` at the top of the panel's body.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/panel/reviewMath.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import type { ApiFailure } from '../lib/api'
import type { PostDetail } from '../lib/types'
import { afterRefusal, NOTE_MAX, noteProblem, reviewButtons } from './reviewMath'

describe('the approval steps the panel offers (spec 2026-10-16 §6.2)', () => {
  it('offers staff Send for approval from Idea, Draft or Needs visual, and managers Approve and Send back on a post in review', () => {
    expect(reviewButtons('draft', true, false)).toEqual({ send: true, approve: false, sendBack: false })
    expect(reviewButtons('idea', true, false).send).toBe(true)
    expect(reviewButtons('needs_visual', true, false).send).toBe(true)
    expect(reviewButtons('needs_review', true, false)).toEqual({ send: false, approve: false, sendBack: false })
    expect(reviewButtons('approved', true, false).send).toBe(false)
    expect(reviewButtons('needs_review', true, true)).toEqual({ send: false, approve: true, sendBack: true })
    expect(reviewButtons('draft', true, true)).toEqual({ send: false, approve: false, sendBack: false })
  })

  it('offers nothing while approvals are off', () => {
    expect(reviewButtons('needs_review', false, true)).toEqual({ send: false, approve: false, sendBack: false })
    expect(reviewButtons('draft', false, false)).toEqual({ send: false, approve: false, sendBack: false })
  })

  it('wants a send-back note of 1 to 2,000 characters, counted as characters', () => {
    expect(noteProblem('')).toBe('invalid')
    expect(noteProblem('   \n ')).toBe('invalid')
    expect(noteProblem('Shorter, please.')).toBeNull()
    expect(noteProblem('a'.repeat(NOTE_MAX))).toBeNull()
    expect(noteProblem('a'.repeat(NOTE_MAX + 1))).toBe('invalid')
    expect(noteProblem('😀'.repeat(NOTE_MAX))).toBeNull()
  })

  // Review Focus 2: a refused Approve shows the post as it now is, so nobody approves words they have not read.
  it('after a refusal that carries the post, hands the post on with the refusal’s code', () => {
    const post = { id: 5, hook: 'Changed since' } as unknown as PostDetail
    expect(afterRefusal({ status: 409, code: 'changed_elsewhere', message: '', post } as ApiFailure)).toEqual({ post, code: 'changed_elsewhere' })
    expect(afterRefusal({ status: 403, code: 'manager_only', message: '' })).toEqual({ post: null, code: 'manager_only' })
  })
})
```

Write `frontend/src/content/panel/reviewBar.test.tsx` with the Write tool:

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
import { bootFor } from '../brand/brandTesting'
import type { Bootstrap, PostDetail } from '../lib/types'
import { ReviewBar } from './ReviewBar'

const post = { id: 5, status: 'draft', updated_at: '2026-10-05T06:00:00.000000Z', author: null, sent_back: false } as unknown as PostDetail
const bootWith = (requires: boolean, manager: boolean) =>
  ({ ...bootFor(manager), profile: { id: 1, setup_completed: true, readiness: 64, requires_approval: requires } }) as Bootstrap
function render(p: PostDetail, requires: boolean, manager: boolean, dirty = false) {
  return renderToStaticMarkup(
    <ContentContext.Provider value={{ data: bootWith(requires, manager), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <ReviewBar post={p} dirty={dirty} onPost={() => {}} />
    </ContentContext.Provider>,
  )
}

describe('the panel’s review bar (spec 2026-10-16 §6.3, §7.1)', () => {
  it('offers staff Send for approval on a draft while approvals are on', () => {
    const html = render(post, true, false)
    expect(html).toContain('Send for approval')
    expect(html).not.toContain('Approve')
  })

  it('shows a post in review as waiting: no step for staff, Approve and Send back for a manager', () => {
    const inReview = { ...post, status: 'needs_review' } as PostDetail
    const staff = render(inReview, true, false)
    expect(staff).toContain('Waiting for approval')
    expect(staff).not.toContain('Send for approval')
    expect(staff).not.toContain('Approve')
    const manager = render(inReview, true, true)
    expect(manager).toContain('Approve')
    expect(manager).toContain('Send back')
  })

  it('says who wrote the post, and that it was sent back, also with approvals off', () => {
    const html = render({ ...post, author: 'Anna', sent_back: true } as PostDetail, false, true)
    expect(html).toContain('Written by Anna')
    expect(html).toContain('Sent back')
    expect(html).not.toContain('Approve')
  })

  // Review Focus 5: a post the AI wrote names nobody.
  it('says nothing for an AI post with approvals off', () => {
    expect(render(post, false, true)).toBe('')
  })

  it('waits while the post has unsaved edits', () => {
    const html = render(post, true, false, true)
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Send for approval/)
    expect(html).toContain('Save your changes first.')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2/vt.sh src/content/panel/reviewMath.test.ts src/content/panel/reviewBar.test.tsx
```

Expected: FAIL — `./reviewMath` and `./ReviewBar` cannot be resolved.

- [ ] **Step 3: The rules, the bar, in the panel**

Write `frontend/src/content/panel/reviewMath.ts` with the Write tool:

```ts
import type { ApiFailure } from '../lib/api'
import { SEND_FROM } from '../lib/approval'
import type { PostDetail, PostStatus } from '../lib/types'

/** The approval steps the panel offers on a post (spec 2026-10-16 §6.2), only while the brand's approvals are on. */
export function reviewButtons(status: PostStatus, on: boolean, manager: boolean): { send: boolean; approve: boolean; sendBack: boolean } {
  const inReview = status === 'needs_review'
  return { send: on && !manager && SEND_FROM.includes(status), approve: on && manager && inReview, sendBack: on && manager && inReview }
}

/** The longest send-back note: the server's comment limit. */
export const NOTE_MAX = 2000

/** Why a send-back note cannot go yet — nothing written, or past 2,000 characters (counted as characters); null when it can. */
export function noteProblem(note: string): 'invalid' | null {
  const length = [...note.trim()].length
  return length === 0 || length > NOTE_MAX ? 'invalid' : null
}

/**
 * After a refused step: the post as it now is when the refusal carries it (`changed_elsewhere`, `wrong_status`) — the
 * panel shows it, so nobody approves words they have not read — and the refusal's code for its words.
 */
export function afterRefusal(failure: ApiFailure): { post: PostDetail | null; code: string } {
  return { post: failure.post ?? null, code: failure.code }
}
```

Write `frontend/src/content/panel/ReviewBar.tsx` with the Write tool:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Hourglass, Send, Undo2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { approvalsOn } from '../lib/approval'
import { errorKey } from '../lib/errors'
import type { PostDetail } from '../lib/types'
import { afterRefusal, NOTE_MAX, noteProblem, reviewButtons } from './reviewMath'

const BOX = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * The post's place in the brand's approvals (spec 2026-10-16 §6.3, §7.1): who wrote it, "Waiting for approval" or
 * "Sent back", and the step this person may take — Send for approval (staff), Approve or Send back with a note
 * (managers, on a post in review). Steps wait while the post has unsaved edits; a refused step that carries the post as
 * it now is shows it (Approve sends the version the panel holds, so changed words are read before they are approved).
 */
export function ReviewBar({ post, dirty, onPost }: { post: PostDetail; dirty: boolean; onPost: (post: PostDetail) => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const api = useApi()
  const on = approvalsOn(boot)
  const buttons = reviewButtons(post.status, on, boot.staff.can_manage)
  const [busy, setBusy] = useState<string | null>(null)
  // The send-back note; null while its box is closed.
  const [note, setNote] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const waiting = on && post.status === 'needs_review'
  const waits = dirty || busy !== null

  const step = async (name: string, call: () => Promise<{ post: PostDetail }>, done: string) => {
    setBusy(name)
    setMessage(null)
    try {
      onPost((await call()).post)
      setNote(null)
      setMessage({ tone: 'success', text: done })
    } catch (e) {
      const { post: now, code } = afterRefusal(failureOf(e))
      if (now) onPost(now)
      const [key, text] = errorKey('approval', code)
      setMessage({ tone: 'danger', text: t(key, text) })
    } finally {
      setBusy(null)
    }
  }

  if (!post.author && !waiting && !post.sent_back && !buttons.send && !buttons.approve) return null
  const noteBad = note !== null && noteProblem(note) !== null
  const [tooLongKey, tooLongText] = errorKey('approval', 'invalid')
  return (
    <section aria-label={t('content.review.title', 'Approval')} data-review="" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {post.author && <span className="text-a-text-2">{t('content.review.written_by', 'Written by {{name}}', { name: post.author })}</span>}
        {waiting && (
          <span className="inline-flex items-center gap-1 rounded-full border border-a-accent-text px-2 py-0.5 font-medium text-a-accent-text">
            <Hourglass size={12} aria-hidden />{t('content.flags.waiting', 'Waiting for approval')}
          </span>
        )}
        {post.sent_back && (
          <span className="inline-flex items-center gap-1 rounded-full bg-a-danger/10 px-2 py-0.5 font-medium text-a-danger">
            <Undo2 size={12} aria-hidden />{t('content.flags.sent_back', 'Sent back')}
          </span>
        )}
      </div>
      {(buttons.send || buttons.approve) && (
        <div className="flex flex-wrap gap-2">
          {buttons.send && (
            <Button size="sm" disabled={waits} loading={busy === 'send'}
              onClick={() => { void step('send', () => api.sendForApproval(post.id), t('content.review.done_sent', 'Sent for approval.')) }}>
              <Send size={14} aria-hidden />{t('content.review.send', 'Send for approval')}
            </Button>
          )}
          {buttons.approve && (
            <Button size="sm" disabled={waits} loading={busy === 'approve'}
              onClick={() => { void step('approve', () => api.approve(post.id, post.updated_at), t('content.review.done_approved', 'Approved.')) }}>
              <CheckCircle2 size={14} aria-hidden />{t('content.review.approve', 'Approve')}
            </Button>
          )}
          {buttons.sendBack && (
            <Button size="sm" variant="secondary" disabled={waits} aria-expanded={note !== null} onClick={() => setNote(n => (n === null ? '' : null))}>
              <Undo2 size={14} aria-hidden />{t('content.review.send_back', 'Send back')}
            </Button>
          )}
        </div>
      )}
      {dirty && (buttons.send || buttons.approve) && <p className="text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      {note !== null && buttons.sendBack && (
        <div className="space-y-2 rounded-lg border border-a-border bg-a-surface-2 p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.review.note', 'What should change? The writer sees this.')}</span>
            <textarea value={note} rows={3} onChange={(e) => setNote(e.target.value)} aria-invalid={[...note].length > NOTE_MAX || undefined} className={BOX} />
          </label>
          {[...note].length > NOTE_MAX && <p className="text-xs text-a-danger">{t(tooLongKey, tooLongText)}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={noteBad || waits} loading={busy === 'back'}
              onClick={() => { void step('back', () => api.sendBack(post.id, note.trim()), t('content.review.done_back', 'Sent back to the writer.')) }}>
              {t('content.review.send_back', 'Send back')}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy === 'back'} onClick={() => setNote(null)}>{t('content.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      )}
      {message && (message.tone === 'danger'
        ? <Notice tone="danger">{message.text}</Notice>
        : <p role="status" className="text-xs text-a-text-2">{message.text}</p>)}
    </section>
  )
}
```

In `frontend/src/content/panel/PostPanel.tsx`, replace:

```tsx
import { RepeatSection } from './RepeatSection'
```

with:

```tsx
import { RepeatSection } from './RepeatSection'
import { ReviewBar } from './ReviewBar'
```

and replace:

```tsx
        {editing && (
          <PostFormFields form={editing.draft}
```

with:

```tsx
        {post && <ReviewBar post={post} dirty={dirty} onPost={adopt} />}
        {editing && (
          <PostFormFields form={editing.draft}
```

Write `$R4C/t5-words.json` with the Write tool:

```json
{
  "review.title": { "en": "Approval", "ru": "Согласование", "de": "Freigabe", "fr": "Validation", "es": "Aprobación" },
  "review.written_by": { "en": "Written by {{name}}", "ru": "Автор: {{name}}", "de": "Geschrieben von {{name}}", "fr": "Rédigée par {{name}}", "es": "Escrita por {{name}}" },
  "review.send": { "en": "Send for approval", "ru": "Отправить на согласование", "de": "Zur Freigabe senden", "fr": "Soumettre à validation", "es": "Enviar a aprobación" },
  "review.approve": { "en": "Approve", "ru": "Одобрить", "de": "Freigeben", "fr": "Approuver", "es": "Aprobar" },
  "review.send_back": { "en": "Send back", "ru": "Вернуть", "de": "Zurückschicken", "fr": "Renvoyer", "es": "Devolver" },
  "review.note": { "en": "What should change? The writer sees this.", "ru": "Что нужно изменить? Автор увидит этот текст.", "de": "Was soll sich ändern? Wer den Beitrag geschrieben hat, sieht diesen Text.", "fr": "Que faut-il changer ? L’auteur verra ce texte.", "es": "¿Qué debe cambiar? Quien la escribió verá este texto." },
  "review.done_sent": { "en": "Sent for approval.", "ru": "Отправлено на согласование.", "de": "Zur Freigabe gesendet.", "fr": "Soumise à validation.", "es": "Enviada a aprobación." },
  "review.done_approved": { "en": "Approved.", "ru": "Одобрено.", "de": "Freigegeben.", "fr": "Approuvée.", "es": "Aprobada." },
  "review.done_back": { "en": "Sent back to the writer.", "ru": "Возвращено автору.", "de": "An die Person zurückgeschickt, die ihn geschrieben hat.", "fr": "Renvoyée à l’auteur.", "es": "Devuelta a quien la escribió." }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node .superpowers/sdd/2026-10-18-content-release-4b-2/words.mjs .superpowers/sdd/2026-10-18-content-release-4b-2/t5-words.json
```

- [ ] **Step 4: Run the tests**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
"$R4C/vt.sh" src/content/panel src/content/i18n src/content/tokens.test.ts src/i18n/localeCompleteness.test.ts && (cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN)
```

Expected: every file passes (`PostPanel.test.tsx` unchanged: its posts have no author and approvals are off, so the bar draws nothing); `TSC-CLEAN`.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/panel frontend/src/content/i18n && git commit -q -m "Content portal: the panel's review bar — Written by, Send for approval, Approve, Send back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && git status --short
```

---

### Task 6: Comments and history at the panel's foot (spec §7.1)

**Files:**
- Create: `frontend/src/content/panel/timelineMath.ts`, `frontend/src/content/panel/Timeline.tsx`
- Modify: `frontend/src/content/panel/PostPanel.tsx`, `frontend/src/content/i18n/contentLocales.test.ts`
- Test: create `frontend/src/content/panel/timelineMath.test.ts`, `frontend/src/content/panel/timeline.test.tsx`; modify `frontend/src/content/panel/PostPanel.test.tsx`
- Words: `$R4C/t6-words.json`

**Interfaces:**
- Consumes: `TimelineItem`, `TimelineComment`, `TimelineEvent`, `EventKind` (Task 1); `api.addComment`, `api.editComment`, `api.deleteComment` (Task 1); `keepTimeline`, `refreshLists` (Task 1); the `comment` refusal family (Task 1).
- Produces: `COMMENT_MAX = 2000`, `TIMELINE_MAX = 200`, `EVENT_TEXT`, `commentProblem(text): 'invalid' | 'too_long' | null`, `sendsOnEnter(e): boolean`, `withComment(post, comment, count)`, `withEdited(post, comment)`, `withoutComment(post, id, count)`, `commentRights(item, manager)` → `{edit, remove}`; `Timeline({ post, items })` (items `null` while the timeline is not read yet); the word `content.people.former` (Task 7 uses it too). The panel keeps a read timeline across answers that carry none, and reads the post again after them.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/panel/timelineMath.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import type { PostDetail, TimelineComment, TimelineEvent } from '../lib/types'
import { COMMENT_MAX, EVENT_TEXT, commentProblem, commentRights, sendsOnEnter, withComment, withEdited, withoutComment } from './timelineMath'

const comment = (id: number, more: Partial<TimelineComment> = {}): TimelineComment => ({
  type: 'comment', id, user: { id: 2, name: 'Maria' }, body: `Comment ${id}`, edited: false, mine: false, at: '2026-10-05T06:00:00.000000Z', ...more,
})
const event: TimelineEvent = { type: 'event', id: 1, kind: 'approved', user: { id: 2, name: 'Maria' }, note: null, at: '2026-10-05T05:00:00.000000Z' }
const post = { id: 5, comments_count: 1, timeline: [event, comment(1)] } as unknown as PostDetail
const keys = (p: PostDetail) => (p.timeline ?? []).map(i => `${i.type}${i.id}`)

describe('comments and history (spec 2026-10-16 §7.1)', () => {
  it('words each approval step as the English bundle does', () => {
    expect(en.timeline.event).toEqual(EVENT_TEXT)
  })

  // Review Focus 3: nothing is sent that the server would refuse; the limit is named.
  it('holds back a comment of nothing but spaces, or past 2,000 characters counted as characters', () => {
    expect(commentProblem('')).toBe('invalid')
    expect(commentProblem(' \n\t ')).toBe('invalid')
    expect(commentProblem('Love it')).toBeNull()
    expect(commentProblem('a'.repeat(COMMENT_MAX))).toBeNull()
    expect(commentProblem(`  ${'a'.repeat(COMMENT_MAX)}  `)).toBeNull()
    expect(commentProblem('a'.repeat(COMMENT_MAX + 1))).toBe('too_long')
    expect(commentProblem('😀'.repeat(COMMENT_MAX))).toBeNull()
  })

  it('sends on Enter, adds a line on Shift + Enter, and sends nothing on the Enter that ends a composition', () => {
    expect(sendsOnEnter({ key: 'Enter', shiftKey: false })).toBe(true)
    expect(sendsOnEnter({ key: 'Enter', shiftKey: true })).toBe(false)
    expect(sendsOnEnter({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false)
    expect(sendsOnEnter({ key: 'a', shiftKey: false })).toBe(false)
  })

  it('puts a new comment at the end with the new count, an edited one in its place, and takes a deleted one out', () => {
    const added = withComment(post, comment(2, { mine: true }), 2)
    expect(keys(added)).toEqual(['event1', 'comment1', 'comment2'])
    expect(added.comments_count).toBe(2)
    const edited = withEdited(added, comment(1, { body: 'Changed', edited: true }))
    expect(edited.timeline?.find(i => i.type === 'comment' && i.id === 1)).toMatchObject({ body: 'Changed', edited: true })
    expect(edited.timeline?.find(i => i.type === 'event')).toBe(event)
    const removed = withoutComment(edited, 1, 1)
    expect(keys(removed)).toEqual(['event1', 'comment2'])
    expect(removed.comments_count).toBe(1)
  })

  it('keeps the newest 200', () => {
    const full = { id: 5, timeline: Array.from({ length: 200 }, (_, i) => comment(i + 1)) } as unknown as PostDetail
    const added = withComment(full, comment(201), 201)
    expect(added.timeline).toHaveLength(200)
    expect(added.timeline?.[0].id).toBe(2)
    expect(added.timeline?.[199].id).toBe(201)
  })

  it('lets people edit their own comments, and delete their own or, as a manager, anyone’s', () => {
    expect(commentRights({ mine: true }, false)).toEqual({ edit: true, remove: true })
    expect(commentRights({ mine: false }, false)).toEqual({ edit: false, remove: false })
    expect(commentRights({ mine: false }, true)).toEqual({ edit: false, remove: true })
  })
})
```

Write `frontend/src/content/panel/timeline.test.tsx` with the Write tool:

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
import type { PostDetail, TimelineItem } from '../lib/types'
import { Timeline } from './Timeline'

const post = { id: 5, comments_count: 3 } as unknown as PostDetail
const items: TimelineItem[] = [
  { type: 'event', id: 1, kind: 'sent_for_approval', user: { id: 7, name: 'Anna' }, note: null, at: '2026-10-05T07:00:00.000000Z' },
  { type: 'comment', id: 2, user: { id: 9, name: 'Maria' }, body: 'Shorter, please.\nAnd a warmer photo.', edited: true, mine: false, at: '2026-10-05T08:00:00.000000Z' },
  { type: 'event', id: 3, kind: 'sent_back', user: { id: 9, name: 'Maria' }, note: 'Two lines at most.', at: '2026-10-05T08:01:00.000000Z' },
  { type: 'comment', id: 4, user: { id: 7, name: 'Anna' }, body: 'On it.', edited: false, mine: true, at: '2026-10-05T09:00:00.000000Z' },
  { type: 'comment', id: 5, user: null, body: 'From someone who left', edited: false, mine: false, at: '2026-10-05T10:00:00.000000Z' },
]
function render(list: TimelineItem[] | null, manager = false) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ContentContext.Provider value={{ data: bootFor(manager), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <Timeline post={post} items={list} />
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}
const count = (html: string, text: string) => html.split(text).length - 1

describe('Comments and history (spec 2026-10-16 §7.1)', () => {
  it('shows comments and approval steps oldest first, each with who and when', () => {
    const html = render(items)
    expect(html).toContain('Comments and history')
    const at = ['Anna sent it for approval', 'Shorter, please.\nAnd a warmer photo.', 'Maria sent it back', 'Two lines at most.', 'On it.', 'From someone who left'].map(text => html.indexOf(text))
    expect(at.every((place, i) => place >= 0 && (i === 0 || place > at[i - 1]))).toBe(true)
    expect(html).toContain('5 Oct')
  })

  // Review Focus 5: someone who has left is not a blank.
  it('marks an edited comment, keeps its lines, and names someone who has left "Former team member"', () => {
    const html = render(items)
    expect(html).toContain('edited')
    expect(html).toContain('whitespace-pre-wrap')
    expect(html).toContain('Former team member')
  })

  it('offers Edit and Delete on your own comment; a manager may also delete anyone’s', () => {
    const staff = render(items)
    expect(count(staff, '>Edit<')).toBe(1)
    expect(count(staff, '>Delete<')).toBe(1)
    const manager = render(items, true)
    expect(count(manager, '>Edit<')).toBe(1)
    expect(count(manager, '>Delete<')).toBe(3)
  })

  it('says when there is nothing yet, and while it loads', () => {
    expect(render([])).toContain('No comments yet.')
    expect(render(null)).toContain('Loading…')
  })

  it('has a box that says how to send', () => {
    const html = render(items)
    expect(html).toContain('Write a comment')
    expect(html).toContain('Enter sends · Shift + Enter adds a line')
  })
})
```

Append at the end of `frontend/src/content/panel/PostPanel.test.tsx`, with the Edit tool:

```tsx
describe('PostPanel: comments and history (spec 2026-10-16 §7.1)', () => {
  it('shows the post’s timeline at its foot, after the actions', () => {
    const withTimeline = {
      ...post, timeline: [{ type: 'comment', id: 1, user: { id: 9, name: 'Maria' }, body: 'Love the hook', edited: false, mine: false, at: '2026-10-05T08:00:00.000000Z' }],
    } as PostDetail
    const html = render({ kind: 'post', id: 5, seq: 1 }, withTimeline)
    expect(html).toContain('Love the hook')
    expect(html.indexOf('Comments and history')).toBeGreaterThan(html.indexOf('content-actions-title'))
  })
})
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
  'ideas.column': ['idea', 'draft', 'review', 'ready'],
```

with:

```ts
  'ideas.column': ['idea', 'draft', 'review', 'ready'],
  // Spec 2026-10-16 §6.4: the approval steps in the timeline.
  'timeline.event': ['sent_for_approval', 'approved', 'sent_back', 'changed_after_approval'],
```

- [ ] **Step 2: Run them to see them fail**

```bash
/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2/vt.sh src/content/panel/timelineMath.test.ts src/content/panel/timeline.test.tsx src/content/panel/PostPanel.test.tsx
```

Expected: failures — `./timelineMath` and `./Timeline` cannot be resolved; the panel shows no "Love the hook".

- [ ] **Step 3: The rules, the timeline, in the panel**

Write `frontend/src/content/panel/timelineMath.ts` with the Write tool:

```ts
import type { EventKind, PostDetail, TimelineComment } from '../lib/types'

/** The longest comment: the server's ContentPlannerPostComment::MAX_LENGTH. */
export const COMMENT_MAX = 2000

/** The most the timeline holds: the server's ContentTimeline::LIMIT (the newest). */
export const TIMELINE_MAX = 200

/** Each approval step's English line, the fallback under content.timeline.event.<kind> (timelineMath.test.ts keeps them equal). */
export const EVENT_TEXT: Record<EventKind, string> = {
  sent_for_approval: '{{name}} sent it for approval',
  approved: '{{name}} approved it',
  sent_back: '{{name}} sent it back',
  changed_after_approval: '{{name}} changed it after approval, so it needs approval again',
}

/** Why a comment cannot go yet: nothing written, or past 2,000 characters (counted as characters); null when it can. */
export function commentProblem(text: string): 'invalid' | 'too_long' | null {
  const trimmed = text.trim()
  if (trimmed === '') return 'invalid'
  return [...trimmed].length > COMMENT_MAX ? 'too_long' : null
}

/** Enter sends; Shift + Enter adds a line; the Enter that ends an input method's composition sends nothing. */
export const sendsOnEnter = (e: { key: string; shiftKey: boolean; isComposing?: boolean }): boolean =>
  e.key === 'Enter' && !e.shiftKey && e.isComposing !== true

/** The post with a new comment at the timeline's end and its new count; the newest 200 kept. */
export function withComment(post: PostDetail, comment: TimelineComment, count: number): PostDetail {
  return { ...post, timeline: [...(post.timeline ?? []), comment].slice(-TIMELINE_MAX), comments_count: count }
}

/** The post with an edited comment in its place. */
export function withEdited(post: PostDetail, comment: TimelineComment): PostDetail {
  return { ...post, timeline: (post.timeline ?? []).map(item => (item.type === 'comment' && item.id === comment.id ? comment : item)) }
}

/** The post without a deleted comment, and its new count. */
export function withoutComment(post: PostDetail, id: number, count: number): PostDetail {
  return { ...post, timeline: (post.timeline ?? []).filter(item => !(item.type === 'comment' && item.id === id)), comments_count: count }
}

/** Edit your own comments; delete your own, or anyone's as a manager (spec §7.1). */
export function commentRights(item: Pick<TimelineComment, 'mine'>, manager: boolean): { edit: boolean; remove: boolean } {
  return { edit: item.mine, remove: item.mine || manager }
}
```

Write `frontend/src/content/panel/Timeline.tsx` with the Write tool:

```tsx
import { useState, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { formatInstant } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { PostDetail, TimelineComment, TimelineEvent, TimelineItem } from '../lib/types'
import { COMMENT_MAX, EVENT_TEXT, commentProblem, commentRights, sendsOnEnter, withComment, withEdited, withoutComment } from './timelineMath'

const BOX = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
const SMALL = 'rounded px-1 text-xs font-medium text-a-text-2 hover:text-a-text'

/** One approval step: a grey line with who and when, a send-back's note beneath. */
function EventLine({ item, name, when }: { item: TimelineEvent; name: string; when: string }) {
  const { t } = useTranslation()
  return (
    <li data-event={item.kind} className="text-xs text-a-text-2">
      <span>{t(`content.timeline.event.${item.kind}`, EVENT_TEXT[item.kind], { name })}</span>
      <span aria-hidden> · </span>
      <time dateTime={item.at}>{when}</time>
      {item.note && <p className="mt-0.5 whitespace-pre-wrap break-words italic text-a-text">{item.note}</p>}
    </li>
  )
}

/** One comment: who and when, "edited", its words with their lines, and Edit / Delete for those who may. */
function CommentItem({ item, name, when, manager, onSave, onDelete }: {
  item: TimelineComment
  name: string
  when: string
  manager: boolean
  /** Saves new words; true when they were saved (the box closes). */
  onSave: (id: number, body: string) => Promise<boolean>
  onDelete: (id: number) => Promise<void>
}) {
  const { t } = useTranslation()
  const rights = commentRights(item, manager)
  // The words being edited; null while the comment is shown.
  const [text, setText] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (text === null || busy) return
    setBusy(true)
    try {
      if (await onSave(item.id, text)) setText(null)
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true)
    try {
      await onDelete(item.id)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li data-comment={item.id} className="rounded-lg border border-a-border bg-a-surface p-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="font-semibold text-a-text">{name}</span>
        <time dateTime={item.at} className="text-a-text-2">{when}</time>
        {item.edited && <span className="text-a-text-2">{t('content.timeline.edited', 'edited')}</span>}
        {text === null && !confirming && (rights.edit || rights.remove) && (
          <span className="ml-auto flex gap-1">
            {rights.edit && <button type="button" className={SMALL} onClick={() => setText(item.body)}>{t('content.timeline.edit', 'Edit')}</button>}
            {rights.remove && <button type="button" className={SMALL} onClick={() => setConfirming(true)}>{t('content.timeline.delete', 'Delete')}</button>}
          </span>
        )}
      </div>
      {text === null
        ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-a-text">{item.body}</p>
        : (
          <div className="mt-1 space-y-2">
            <textarea value={text} rows={3} onChange={(e) => setText(e.target.value)} aria-label={t('content.timeline.edit', 'Edit')} className={BOX} />
            <div className="flex gap-2">
              <Button size="sm" loading={busy} onClick={() => { void save() }}>{t('content.timeline.save', 'Save')}</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setText(null)}>{t('content.common.cancel', 'Cancel')}</Button>
            </div>
          </div>
        )}
      {confirming && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-a-text">
          <span>{t('content.timeline.delete_confirm', 'Delete this comment?')}</span>
          <Button size="sm" variant="danger" loading={busy} onClick={() => { void remove() }}>{t('content.timeline.delete_yes', 'Delete comment')}</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>{t('content.common.cancel', 'Cancel')}</Button>
        </div>
      )}
    </li>
  )
}

/**
 * Comments and history (spec 2026-10-16 §7.1), at the panel's foot: the post's comments and its approval steps, oldest
 * first, the newest 200; a box adds a comment (Enter sends, Shift + Enter adds a line; plain text, 1–2,000
 * characters, the limit said before anything is sent). People edit or delete their own comments; managers delete
 * anyone's. A comment changes the cached post and the lists' counts; it never touches the post itself.
 */
export function Timeline({ post, items }: { post: PostDetail; items: TimelineItem[] | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const update = (change: (p: PostDetail) => PostDetail) =>
    queryClient.setQueryData<PostDetail>(['content', brand, 'post', post.id], old => (old ? change(old) : old))
  const say = (code: string) => {
    const [key, words] = errorKey('comment', code)
    setError(t(key, words))
  }
  const name = (item: TimelineItem) => item.user?.name ?? t('content.people.former', 'Former team member')
  const when = (at: string) => formatInstant(at, locale, boot.venue.timezone)
  const tooLong = [...text.trim()].length > COMMENT_MAX
  const [tooLongKey, tooLongWords] = errorKey('comment', 'too_long')

  const send = async () => {
    // Nothing written, or too long (the line under the box says so): nothing goes.
    if (commentProblem(text) !== null || busy) return
    setBusy(true)
    setError(null)
    try {
      const { comment, comments_count } = await api.addComment(post.id, text.trim())
      update(p => withComment(p, comment, comments_count))
      setText('')
      void refreshLists(queryClient, brand)
    } catch (e) {
      say(failureOf(e).code)
    } finally {
      setBusy(false)
    }
  }
  const saveEdit = async (id: number, body: string): Promise<boolean> => {
    const problem = commentProblem(body)
    if (problem) {
      say(problem)
      return false
    }
    setError(null)
    try {
      const { comment } = await api.editComment(id, body.trim())
      update(p => withEdited(p, comment))
      return true
    } catch (e) {
      say(failureOf(e).code)
      return false
    }
  }
  const remove = async (id: number) => {
    setError(null)
    try {
      const { comments_count } = await api.deleteComment(id)
      update(p => withoutComment(p, id, comments_count))
      void refreshLists(queryClient, brand)
    } catch (e) {
      say(failureOf(e).code)
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!sendsOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) return
    e.preventDefault()
    void send()
  }

  return (
    <section aria-labelledby="content-timeline-title" className="space-y-3">
      <h3 id="content-timeline-title" className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{t('content.timeline.title', 'Comments and history')}</h3>
      {items === null
        ? <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>
        : items.length === 0
          ? <p className="text-sm text-a-text-2">{t('content.timeline.empty', 'No comments yet.')}</p>
          : (
            <ol className="space-y-2">
              {items.map(item => (item.type === 'event'
                ? <EventLine key={`event-${item.id}`} item={item} name={name(item)} when={when(item.at)} />
                : <CommentItem key={`comment-${item.id}`} item={item} name={name(item)} when={when(item.at)} manager={boot.staff.can_manage} onSave={saveEdit} onDelete={remove} />))}
            </ol>
          )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{t('content.timeline.box', 'Write a comment')}</span>
        <textarea value={text} rows={2} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
          aria-invalid={tooLong || undefined} aria-describedby="content-timeline-hint" className={BOX} />
      </label>
      {tooLong && <p className="text-xs text-a-danger">{t(tooLongKey, tooLongWords)}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="content-timeline-hint" className="text-xs text-a-text-2">{t('content.timeline.hint', 'Enter sends · Shift + Enter adds a line')}</p>
        <Button size="sm" variant="secondary" loading={busy} disabled={text.trim() === '' || tooLong} onClick={() => { void send() }}>
          {t('content.timeline.send', 'Comment')}
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
```

In `frontend/src/content/panel/PostPanel.tsx`:

1. Replace `import { cardOf, putInPlans, refreshLists } from '../lib/planCache'` with `import { cardOf, keepTimeline, putInPlans, refreshLists } from '../lib/planCache'`.

2. Replace:

```tsx
import { ReviewBar } from './ReviewBar'
```

with:

```tsx
import { ReviewBar } from './ReviewBar'
import { Timeline } from './Timeline'
```

3. Replace:

```tsx
  const show = (fresh: PostDetail) => {
    queryClient.setQueryData(['content', brand, 'post', fresh.id], fresh)
    putInPlans(queryClient, brand, cardOf(fresh))
```

with:

```tsx
  const show = (fresh: PostDetail) => {
    queryClient.setQueryData<PostDetail>(['content', brand, 'post', fresh.id], old => keepTimeline(fresh, old))
    // An answer without the timeline (a save, an AI answer) may have recorded an approval step: the post is read again.
    if (fresh.timeline === undefined) void queryClient.invalidateQueries({ queryKey: ['content', brand, 'post', fresh.id], exact: true })
    putInPlans(queryClient, brand, cardOf(fresh))
```

4. Replace:

```tsx
              onDeleted={(deleted) => {
                queryClient.removeQueries({ queryKey: ['content', brand, 'post', deleted] })
                void refreshLists(queryClient, brand)
                panel.close()
              }} />
          </>
```

with:

```tsx
              onDeleted={(deleted) => {
                queryClient.removeQueries({ queryKey: ['content', brand, 'post', deleted] })
                void refreshLists(queryClient, brand)
                panel.close()
              }} />
            {/* The timeline as last read (spec 2026-10-16 §7.1): an answer that carried none keeps it until the post is read again. */}
            <Timeline post={post} items={detail.data && detail.data.id === post.id ? (detail.data.timeline ?? null) : null} />
          </>
```

Write `$R4C/t6-words.json` with the Write tool:

```json
{
  "timeline.title": { "en": "Comments and history", "ru": "Комментарии и история", "de": "Kommentare und Verlauf", "fr": "Commentaires et historique", "es": "Comentarios e historial" },
  "timeline.empty": { "en": "No comments yet.", "ru": "Комментариев пока нет.", "de": "Noch keine Kommentare.", "fr": "Aucun commentaire pour l’instant.", "es": "Aún no hay comentarios." },
  "timeline.box": { "en": "Write a comment", "ru": "Напишите комментарий", "de": "Kommentar schreiben", "fr": "Écrire un commentaire", "es": "Escribe un comentario" },
  "timeline.hint": { "en": "Enter sends · Shift + Enter adds a line", "ru": "Enter — отправить · Shift + Enter — новая строка", "de": "Enter sendet · Umschalt + Enter fügt eine Zeile ein", "fr": "Entrée envoie · Maj + Entrée ajoute une ligne", "es": "Intro envía · Mayús + Intro añade una línea" },
  "timeline.send": { "en": "Comment", "ru": "Отправить", "de": "Kommentieren", "fr": "Commenter", "es": "Comentar" },
  "timeline.edited": { "en": "edited", "ru": "изменён", "de": "bearbeitet", "fr": "modifié", "es": "editado" },
  "timeline.edit": { "en": "Edit", "ru": "Изменить", "de": "Bearbeiten", "fr": "Modifier", "es": "Editar" },
  "timeline.save": { "en": "Save", "ru": "Сохранить", "de": "Speichern", "fr": "Enregistrer", "es": "Guardar" },
  "timeline.delete": { "en": "Delete", "ru": "Удалить", "de": "Löschen", "fr": "Supprimer", "es": "Eliminar" },
  "timeline.delete_confirm": { "en": "Delete this comment?", "ru": "Удалить этот комментарий?", "de": "Diesen Kommentar löschen?", "fr": "Supprimer ce commentaire ?", "es": "¿Eliminar este comentario?" },
  "timeline.delete_yes": { "en": "Delete comment", "ru": "Удалить комментарий", "de": "Kommentar löschen", "fr": "Supprimer le commentaire", "es": "Eliminar comentario" },
  "timeline.event.sent_for_approval": { "en": "{{name}} sent it for approval", "ru": "Отправлено на согласование ({{name}})", "de": "Zur Freigabe gesendet von {{name}}", "fr": "{{name}} l’a soumise à validation", "es": "{{name}} la envió a aprobación" },
  "timeline.event.approved": { "en": "{{name}} approved it", "ru": "Одобрено ({{name}})", "de": "Freigegeben von {{name}}", "fr": "{{name}} l’a approuvée", "es": "{{name}} la aprobó" },
  "timeline.event.sent_back": { "en": "{{name}} sent it back", "ru": "Возвращено автору ({{name}})", "de": "Zurückgeschickt von {{name}}", "fr": "{{name}} l’a renvoyée", "es": "{{name}} la devolvió" },
  "timeline.event.changed_after_approval": { "en": "{{name}} changed it after approval, so it needs approval again", "ru": "Изменено после одобрения ({{name}}) — нужно одобрить заново", "de": "Nach der Freigabe geändert von {{name}} – braucht erneut eine Freigabe", "fr": "{{name}} l’a modifiée après approbation : elle doit être approuvée à nouveau", "es": "{{name}} la cambió tras la aprobación: necesita aprobarse de nuevo" },
  "people.former": { "en": "Former team member", "ru": "Бывший сотрудник", "de": "Ehemaliges Teammitglied", "fr": "Ancien membre de l’équipe", "es": "Antiguo miembro del equipo" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node .superpowers/sdd/2026-10-18-content-release-4b-2/words.mjs .superpowers/sdd/2026-10-18-content-release-4b-2/t6-words.json
```

- [ ] **Step 4: Run the tests**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
"$R4C/vt.sh" src/content/panel src/content/lib src/content/i18n src/content/tokens.test.ts src/i18n/localeCompleteness.test.ts && (cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN)
```

Expected: every file passes; `TSC-CLEAN`. If an older `PostPanel.test.tsx` case now meets "Loading…" twice (the timeline's own line beside the panel's), it is the timeline of a cached post without one: such a case checks what it always did and passes.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/panel frontend/src/content/i18n && git commit -q -m "Content portal: comments and history at the panel's foot" -m "Comments (Enter sends, Shift + Enter adds a line, 2,000 characters said
before sending), edit and delete your own, managers delete anyone's, the
approval steps as grey lines, \"Former team member\" for someone who left.
The panel keeps a read timeline across answers that carry none and reads
the post again after them." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && git status --short
```

---

### Task 7: The "For you" bell (spec §8)

**Files:**
- Modify: `frontend/src/content/ui/PopMenu.tsx`, `frontend/src/content/ContentShell.tsx`, `frontend/src/content/ContentShell.test.tsx`, `frontend/src/content/i18n/contentLocales.test.ts`
- Create: `frontend/src/content/bell/bellMath.ts`, `frontend/src/content/bell/ForYouBell.tsx`
- Test: create `frontend/src/content/ui/popMenu.test.tsx`, `frontend/src/content/bell/bellMath.test.ts`, `frontend/src/content/bell/forYouBell.test.tsx`
- Words: `$R4C/t7-words.json`

**Interfaces:**
- Consumes: `InboxItem`, `InboxPayload` (Task 1); `api.inbox`, `api.inboxCount`, `api.inboxSeen` (Task 1); the `inbox` refusal family (Task 1); `content.people.former` (Task 6); `cardLine` (`lib/postText.ts`); `usePanel().open`.
- Produces: `PopItem.mark?: boolean`; `PopMenu` props `emptyText?`, `markLabel?`, `onOpenChange?(open)`; `PopList` (the open list, exported for tests); `badgeText(count)`, `BELL_TEXT`, `bellItems(items, t, when)`; `ForYouBell()` in the header beside New post. Query keys: `['content', brand, 'inbox', 'count']` (read every 60 s while the tab is shown, and on coming back into view) and `['content', brand, 'inbox', 'list']` (read when the menu opens, dropped when it closes).

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/ui/popMenu.test.tsx` with the Write tool:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PopList, PopMenu } from './PopMenu'

describe('the shared menu (spec 2026-10-16 §3.5, §8)', () => {
  it('draws nothing without items, unless it has an empty line to say', () => {
    expect(renderToStaticMarkup(<PopMenu label="Insert" items={[]} onPick={() => {}} className="b">Insert</PopMenu>)).toBe('')
    const bell = renderToStaticMarkup(<PopMenu label="For you" items={[]} emptyText="Nothing new for you." onPick={() => {}} className="b">Bell</PopMenu>)
    expect(bell).toContain('aria-label="For you"')
  })

  // Review Focus 4: an open list with nothing in it says so.
  it('says its empty line when the list has no items', () => {
    expect(renderToStaticMarkup(<PopList id="l" items={[]} emptyText="Nothing new for you." onPick={() => {}} className="c" />)).toContain('Nothing new for you.')
  })

  it('marks the lines to notice, with a word for a screen reader, and draws the others as before', () => {
    const html = renderToStaticMarkup(
      <PopList id="l" markLabel="New" onPick={() => {}} className="c"
        items={[{ id: 'a', label: 'Maria commented: Autumn', sub: 'Love it · 5 Oct, 09:00', mark: true }, { id: 'b', label: 'Anna approved: Spring' }]} />,
    )
    expect(html.split('data-mark=""').length - 1).toBe(1)
    expect(html).toContain('<span class="sr-only">New: </span>')
    expect(html).toContain('<span class="block truncate text-sm font-medium text-a-text">Anna approved: Spring</span>')
  })
})
```

Write `frontend/src/content/bell/bellMath.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import type { InboxItem } from '../lib/types'
import { BELL_TEXT, badgeText, bellItems } from './bellMath'

const t = (_key: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
const when = (at: string) => `at ${at.slice(11, 16)}`
const item = (kind: InboxItem['kind'], more: Partial<InboxItem> = {}): InboxItem => ({
  id: `${kind}:1`, kind, post: { id: 5, platform: 'instagram', title: null, hook: 'Three colours', topic: 'Autumn', scheduled_date: '2026-10-07' },
  by: { id: 9, name: 'Maria' }, note: null, at: '2026-10-05T08:00:00.000000Z', unread: true, ...more,
})

describe('the "For you" bell (spec 2026-10-16 §8)', () => {
  it('words each kind as the English bundle does', () => {
    expect(en.bell.kind).toEqual(BELL_TEXT)
  })

  // Review Focus 4.
  it('shows no badge at zero, the number up to 99, then "99+"', () => {
    expect(badgeText(0)).toBe('')
    expect(badgeText(7)).toBe('7')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
  })

  it('says what happened to which post, with who, the note and when beneath, marking the news', () => {
    const [waiting, approved, back, comment] = bellItems([
      item('waiting', { by: { id: 7, name: 'Anna' }, unread: false }),
      item('approved'),
      item('sent_back', { note: 'Shorter, please.' }),
      item('comment', { note: 'Love it', post: { id: 6, platform: 'linkedin', title: null, hook: null, topic: null, scheduled_date: null } }),
    ], t, when)
    expect(waiting).toEqual({ id: 'waiting:1', label: 'Waiting for approval: Three colours', sub: 'Anna · at 08:00', mark: false })
    expect(approved).toEqual({ id: 'approved:1', label: 'Maria approved: Three colours', sub: 'at 08:00', mark: true })
    expect(back.sub).toBe('Shorter, please. · at 08:00')
    expect(comment.label).toBe('Maria commented: Untitled post')
  })

  // Review Focus 5.
  it('names someone who has left "Former team member", and nobody for a waiting post the AI wrote', () => {
    const [left, ai] = bellItems([item('comment', { by: null, note: 'Hi' }), item('waiting', { by: null })], t, when)
    expect(left.label).toBe('Former team member commented: Three colours')
    expect(ai.sub).toBe('at 08:00')
  })
})
```

Write `frontend/src/content/bell/forYouBell.test.tsx` with the Write tool:

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
import { PanelProvider } from '../panel/PanelProvider'
import { ForYouBell } from './ForYouBell'

function render(count: number | null) {
  const client = new QueryClient()
  if (count !== null) client.setQueryData(['content', 3, 'inbox', 'count'], { count })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentContext.Provider value={{ data: bootFor(true), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <PanelProvider><ForYouBell /></PanelProvider>
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}

describe('the "For you" button (spec 2026-10-16 §8)', () => {
  it('names its count and shows it as a badge', () => {
    const html = render(3)
    expect(html).toContain('aria-label="For you (3)"')
    expect(html).toContain('>3</span>')
    expect(html).toContain('data-bell=""')
  })

  it('shows no badge with nothing new, or before the count is read', () => {
    expect(render(0)).toContain('aria-label="For you"')
    expect(render(0)).not.toMatch(/>\d+<\/span>/)
    expect(render(null)).toContain('aria-label="For you"')
  })

  it('caps the badge at 99+', () => {
    expect(render(120)).toContain('>99+</span>')
  })
})
```

In `frontend/src/content/ContentShell.test.tsx`:

1. Replace:

```tsx
import { MemoryRouter, Route, Routes } from 'react-router-dom'
```

with:

```tsx
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
```

2. Replace:

```tsx
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/content']}>
```

with:

```tsx
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/content']}>
```

3. Replace:

```tsx
      </Routes>
    </MemoryRouter>,
  )
}
```

with:

```tsx
      </Routes>
    </MemoryRouter>
    </QueryClientProvider>,
  )
}
```

4. Replace:

```tsx
describe('ContentShell', () => {
```

with:

```tsx
describe('ContentShell: the bell (spec 2026-10-16 §8)', () => {
  it('puts the "For you" bell beside New post once the workspace is ready, and not while it loads', () => {
    expect(render()).toContain('data-bell=""')
    expect(render({ data: undefined, isLoading: true })).not.toContain('data-bell=""')
  })
})

describe('ContentShell', () => {
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
  'timeline.event': ['sent_for_approval', 'approved', 'sent_back', 'changed_after_approval'],
```

with:

```ts
  'timeline.event': ['sent_for_approval', 'approved', 'sent_back', 'changed_after_approval'],
  // Spec §8: the bell's lines by kind.
  'bell.kind': ['waiting', 'approved', 'sent_back', 'comment'],
```

and replace `'panel.blanks', 'flags.comments']` with `'panel.blanks', 'flags.comments', 'bell.label_count']`.

- [ ] **Step 2: Run them to see them fail**

```bash
/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2/vt.sh src/content/ui/popMenu.test.tsx src/content/bell src/content/ContentShell.test.tsx
```

Expected: failures — `PopList` is not exported (and a menu without items draws nothing); `./bellMath` and `./ForYouBell` cannot be resolved; the shell has no `data-bell`.

- [ ] **Step 3: The menu learns three things**

Write `frontend/src/content/ui/PopMenu.tsx` with the Write tool (read it first; this is the whole file as it becomes — the list moves into `PopList`, and the menu learns `emptyText`, `markLabel` and `onOpenChange`; everything else is as it was):

```tsx
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { focusWasInside, listPlace, outside } from './menuFocus'

export interface PopItem {
  id: string
  label: string
  sub?: string
  /** A line to notice (the bell's news): a dot, a tint, and `markLabel` for a screen reader. */
  mark?: boolean
}

/** The open list of a PopMenu — its own component so a static render can draw it (a test cannot open the menu). */
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
  return (
    <ul id={id} className={className}>
      {items.length === 0 && emptyText !== undefined && <li className="px-2 py-1.5 text-sm text-a-text-2">{emptyText}</li>}
      {items.map(item => (
        <li key={item.id}>
          <button type="button" data-mark={item.mark ? '' : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(item.id)}
            className={`block w-full rounded-md px-2 py-1.5 text-left hover:bg-a-surface-2 ${item.mark ? 'bg-a-accent/10' : ''}`}>
            {item.mark ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-a-text">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-a-accent" />
                {markLabel && <span className="sr-only">{markLabel}: </span>}
                <span className="truncate">{item.label}</span>
              </span>
            ) : <span className="block truncate text-sm font-medium text-a-text">{item.label}</span>}
            {item.sub && <span className="block truncate text-xs text-a-text-2">{item.sub}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * A small menu behind a button (spec 2026-10-16 §3.5): the day's "+", Insert, the Template menu, an idea's "Move to…",
 * the "For you" bell. Real buttons; a mouse press does not take the focus, so a field keeps its cursor. While open, an
 * Escape anywhere closes the list (claimed, so an open panel stays open), as does a press or the focus outside it; after
 * a choice or an Escape in the list the focus goes back to the button. Nothing shows without items — unless the menu has
 * an empty line to say (`emptyText`). `onOpenChange` hears every opening and closing.
 */
export function PopMenu({ label, items, onPick, className, children, wrapClassName = '', data, align = 'right', side = 'below', listClassName = 'w-64', title, emptyText, markLabel, onOpenChange }: {
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
  /** Where the list opens: above where a list below would leave the screen (the foot of a week day). */
  side?: 'below' | 'above'
  listClassName?: string
  title?: string
  /** Said in the open list when there are no items; with it, the menu shows even without items. */
  emptyText?: string
  markLabel?: string
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const listId = useId()
  // The latest callback, read only in handlers (never while rendering).
  const changed = useRef(onOpenChange)
  useEffect(() => { changed.current = onOpenChange })

  const shut = () => {
    setOpen(false)
    changed.current?.(false)
  }
  const close = () => {
    if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
    shut()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (focusWasInside(box.current, document.activeElement)) toggle.current?.focus()
      setOpen(false)
      changed.current?.(false)
    }
    const onPress = (e: PointerEvent) => {
      if (!outside(box.current, e.target)) return
      setOpen(false)
      changed.current?.(false)
    }
    // Capture: the list closes before the panel's own Escape (which skips a claimed one) or a press reaches anything else.
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
    }
  }, [open])

  if (items.length === 0 && emptyText === undefined) return null
  // data-menu: a click anywhere in the menu (its padding included) is the menu's, never a day's (plan/addMath clickAdds).
  return (
    <div ref={box} data-menu="" data-side={side} data-align={align} className={`relative ${wrapClassName}`} onBlur={(e) => { if (open && outside(box.current, e.relatedTarget)) shut() }}>
      <button ref={toggle} type="button" aria-haspopup="true" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={label} title={title}
        {...data} onMouseDown={(e) => e.preventDefault()} onClick={() => { const next = !open; setOpen(next); changed.current?.(next) }} className={className}>
        {children}
      </button>
      {open && (
        <PopList id={listId} items={items} emptyText={emptyText} markLabel={markLabel} onPick={(id) => { onPick(id); close() }}
          className={`absolute ${listPlace(align, side)} z-20 max-h-64 overflow-y-auto rounded-lg border border-a-border bg-a-surface p-1 shadow-a-lg ${listClassName}`} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: The bell's words, the bell, in the header**

Write `frontend/src/content/bell/bellMath.ts` with the Write tool:

```ts
import type { Translate } from '../lib/approval'
import { cardLine } from '../lib/postText'
import type { InboxItem, InboxKind } from '../lib/types'
import type { PopItem } from '../ui/PopMenu'

/** The badge: nothing at 0, the number up to 99, then "99+". */
export const badgeText = (count: number): string => (count <= 0 ? '' : count > 99 ? '99+' : String(count))

/** Each kind's English line, the fallback under content.bell.kind.<kind> (bellMath.test.ts keeps them equal). */
export const BELL_TEXT: Record<InboxKind, string> = {
  waiting: 'Waiting for approval: {{post}}',
  approved: '{{name}} approved: {{post}}',
  sent_back: '{{name}} sent back: {{post}}',
  comment: '{{name}} commented: {{post}}',
}

/**
 * The list's lines (spec 2026-10-16 §8), newest first as the server sends them: what happened to which post; beneath,
 * who wrote a waiting post (nobody for one the AI wrote), or the note or comment, and when. News is marked.
 */
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

Write `frontend/src/content/bell/ForYouBell.tsx` with the Write tool:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'
import { formatInstant } from '../../workspace/lib/wallClock'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { usePanel } from '../panel/PanelProvider'
import { PopMenu } from '../ui/PopMenu'
import { badgeText, bellItems } from './bellMath'

/**
 * The "For you" bell (spec 2026-10-16 §8), for the brand the portal works on: its count read every 60 seconds while the
 * tab is shown and again when the tab comes back into view; its list read when it opens, newest first, the news marked;
 * the read is then marked seen up to when it was made (what waits for approval stays). A line opens its post.
 */
export function ForYouBell() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const panel = usePanel()
  const [open, setOpen] = useState(false)
  const seenFor = useRef<string | null>(null)
  const countKey = ['content', brand, 'inbox', 'count']
  const listKey = ['content', brand, 'inbox', 'list']
  const count = useQuery({ queryKey: countKey, queryFn: api.inboxCount, refetchInterval: 60_000, refetchOnWindowFocus: true, staleTime: 30_000 })
  const list = useQuery({ queryKey: listKey, queryFn: api.inbox, enabled: open, staleTime: 0 })
  const read = list.data

  // Opening the list marks what it shows as seen — up to when it was read, so news that came in since stays new.
  useEffect(() => {
    if (!open || !read || seenFor.current === read.read_at) return
    seenFor.current = read.read_at
    void api.inboxSeen(read.read_at).then(answer => queryClient.setQueryData(['content', brand, 'inbox', 'count'], { count: answer.count }), () => {})
  }, [open, read, api, queryClient, brand])

  const total = count.data?.count ?? 0
  const badge = badgeText(total)
  const label = total > 0 ? t('content.bell.label_count', 'For you ({{count}})', { count: total }) : t('content.bell.label', 'For you')
  const [failedKey, failedWords] = errorKey('inbox', failureOf(list.error).code)
  const emptyText = list.isError ? t(failedKey, failedWords) : read ? t('content.bell.empty', 'Nothing new for you.') : t('content.common.loading', 'Loading…')
  const items = read ? bellItems(read.items, (key, fallback, vars) => t(key, fallback, vars), at => formatInstant(at, locale, boot.venue.timezone)) : []

  return (
    <PopMenu label={label} title={label} items={items} emptyText={emptyText} markLabel={t('content.bell.new', 'New')}
      align="right" listClassName="w-80" data={{ 'data-bell': '' }}
      onOpenChange={(next) => {
        setOpen(next)
        // A closed list is dropped: the next opening reads it afresh (and marks that read seen).
        if (!next) queryClient.removeQueries({ queryKey: ['content', brand, 'inbox', 'list'] })
      }}
      onPick={(id) => { const post = read?.items.find(item => item.id === id)?.post; if (post) panel.open(post.id) }}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-a-border bg-a-surface text-a-text-2 shadow-a-sm hover:text-a-text">
      <Bell size={16} aria-hidden />
      {badge && (
        <span aria-hidden className="absolute -right-1 -top-1 min-w-[1.125rem] rounded-full bg-a-accent px-1 text-center font-a-mono text-xs leading-[1.125rem] text-a-accent-ink">{badge}</span>
      )}
    </PopMenu>
  )
}
```

In `frontend/src/content/ContentShell.tsx`:

1. Replace:

```tsx
import { useContent } from './ContentProvider'
```

with:

```tsx
import { ForYouBell } from './bell/ForYouBell'
import { useContent } from './ContentProvider'
```

2. Replace:

```tsx
 * the organisation and the brand (a switcher when the person may use more
 * than one), Find and New post; and the notices that explain why something
```

with:

```tsx
 * the organisation and the brand (a switcher when the person may use more
 * than one), Find, the "For you" bell and New post; and the notices that explain why something
```

3. Replace:

```tsx
        <button type="button" onClick={() => { if (today !== null) openNew({ date: today, platform: null }) }} disabled={!ready}
          aria-label={t('content.shell.new_post', 'New post')}
          className="ml-auto inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-a-accent px-3 py-2 text-sm font-semibold text-a-accent-ink shadow-a-sm transition hover:bg-a-accent-deep disabled:opacity-60 sm:px-4 [@media(hover:hover)]:hover:-translate-y-px">
          <Plus size={16} aria-hidden /><span className="hidden sm:inline">{t('content.shell.new_post', 'New post')}</span>
        </button>
```

with:

```tsx
        {/* The bell beside New post (spec 2026-10-16 §8): what waits for this person, and their news, for the brand at work. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {ready && <ForYouBell />}
          <button type="button" onClick={() => { if (today !== null) openNew({ date: today, platform: null }) }} disabled={!ready}
            aria-label={t('content.shell.new_post', 'New post')}
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-a-accent px-3 py-2 text-sm font-semibold text-a-accent-ink shadow-a-sm transition hover:bg-a-accent-deep disabled:opacity-60 sm:px-4 [@media(hover:hover)]:hover:-translate-y-px">
            <Plus size={16} aria-hidden /><span className="hidden sm:inline">{t('content.shell.new_post', 'New post')}</span>
          </button>
        </div>
```

Write `$R4C/t7-words.json` with the Write tool:

```json
{
  "bell.label": { "en": "For you", "ru": "Для вас", "de": "Für Sie", "fr": "Pour vous", "es": "Para ti" },
  "bell.label_count": { "en": "For you ({{count}})", "ru": "Для вас ({{count}})", "de": "Für Sie ({{count}})", "fr": "Pour vous ({{count}})", "es": "Para ti ({{count}})" },
  "bell.empty": { "en": "Nothing new for you.", "ru": "Ничего нового.", "de": "Nichts Neues für Sie.", "fr": "Rien de nouveau pour vous.", "es": "Nada nuevo para ti." },
  "bell.new": { "en": "New", "ru": "Новое", "de": "Neu", "fr": "Nouveau", "es": "Nuevo" },
  "bell.kind.waiting": { "en": "Waiting for approval: {{post}}", "ru": "Ждёт одобрения: {{post}}", "de": "Wartet auf Freigabe: {{post}}", "fr": "En attente d’approbation : {{post}}", "es": "Pendiente de aprobación: {{post}}" },
  "bell.kind.approved": { "en": "{{name}} approved: {{post}}", "ru": "Одобрено ({{name}}): {{post}}", "de": "Freigegeben von {{name}}: {{post}}", "fr": "{{name}} a approuvé : {{post}}", "es": "{{name}} aprobó: {{post}}" },
  "bell.kind.sent_back": { "en": "{{name}} sent back: {{post}}", "ru": "Возвращено ({{name}}): {{post}}", "de": "Zurückgeschickt von {{name}}: {{post}}", "fr": "{{name}} a renvoyé : {{post}}", "es": "{{name}} devolvió: {{post}}" },
  "bell.kind.comment": { "en": "{{name}} commented: {{post}}", "ru": "Комментарий ({{name}}): {{post}}", "de": "Kommentar von {{name}}: {{post}}", "fr": "{{name}} a commenté : {{post}}", "es": "{{name}} comentó: {{post}}" }
}
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && node .superpowers/sdd/2026-10-18-content-release-4b-2/words.mjs .superpowers/sdd/2026-10-18-content-release-4b-2/t7-words.json
```

- [ ] **Step 5: Run the tests**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
"$R4C/vt.sh" src/content src/workspace src/i18n/localeCompleteness.test.ts && (cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN)
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: every file in `src/content` and `src/workspace` passes (the menus that used PopMenu before — the day's "+", Insert, Template, Move to… — unchanged: `insertMenu.test.tsx`, `planPieces.test.tsx`, `ideas.test.tsx` pass); `TSC-CLEAN`; the lint at its baseline (`✖ 17 problems`, none in `src/content`).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content && git commit -q -m "Content portal: the For you bell in the header, on the shared menu" -m "Its count read every 60 s and when the tab comes back; its list read when
opened, news marked, then seen up to that read; a line opens its post. The
shared menu learns an empty line, marked lines and an open/close callback." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && git status --short
```

---

### Task 8: The runbook — release 4b's portal

**Files:**
- Modify: `docs/content-workspace.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: The portal's release-4b rules and the owner's checks**

In `docs/content-workspace.md`, replace:

```markdown
  template"; "+ → From a template…" with Use and Write with AI (the panel shows the AI working).
```

with:

```markdown
  template"; "+ → From a template…" with Use and Write with AI (the panel shows the AI working).
- **Approvals** (release 4b): Brand → Approvals switches them per brand (managers; everyone reads it). While on, a
  staff member's status list stops before Approved, Mark ready and Mark published are not offered, and the Ideas
  board's Ready column takes no card (`lib/approval.ts`). The panel's review bar says who wrote the post, "Waiting for
  approval" or "Sent back", and offers Send for approval (staff, from Idea, Draft or Needs visual — not again on a post
  already in review) or Approve and Send back with a note (managers, on a post in review). Approve sends the version
  the panel holds: a post changed since is refused and shown as it now is. Cards on the Plan, Ideas and Posts carry the
  same flags and their comment count.
- **Comments and history** at the panel's foot: comments and approval steps, oldest first, the newest 200; Enter sends,
  Shift + Enter adds a line; 2,000 characters at most, said before sending; edit or delete your own, managers delete
  anyone's; "Former team member" where the user is gone. A comment never touches the post.
- **The "For you" bell** beside New post (`bell/ForYouBell.tsx`, on `ui/PopMenu.tsx`): its count read every 60 s while
  the tab is shown and when the tab comes back into view; the list read when opened, news marked, then marked seen up
  to that read (`read_at`); a line opens its post. One brand at a time.
```

and replace:

```markdown
  out (404 before release 4b).
```

with:

```markdown
  out (404 before release 4b); the `ContentApp` chunk carries "Comments and history", "Waiting for approval" and
  "Nothing new for you".
- After the deploy (owner): on a real brand, switch Approvals on, send one post for approval as a staff member,
  approve one and send one back as a manager, add a comment, and look at both bells; switch Approvals off again if the
  team does not want them yet; reload admin tabs left open.
```

- [ ] **Step 2: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md && git commit -q -m "Runbook: release 4b's portal — approvals, comments and history, the For you bell; the owner's checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 9: The release checks

The spec's checks (§10) on the finished branch, before the final whole-branch review (whose fix pass, if it changes the portal, runs Steps 1–3 and the touched pass checks again) and before anything is deployed. This task writes only to `$R4C` (git-ignored), to the local database (a temporary brand and a temporary staff member, removed at the end) and, for each defect a check finds, to the branch: every such fix goes in test-first (a test that fails, then passes) with a ledger line `Task 9: fixed <what> — <test> RED→GREEN`, and its own commit.

**Files:**
- Create (all under `$R4C`): `tools/` (a copy of 4A-2's tools) with a new `tools/pass.mjs` and `tools/lh.mjs`; `pass-seed.php`, `pass-unseed.php`, `final-vitest.txt`, `final-php.txt`, `build.txt`, `lighthouse.md`, `eyes.md`, `keys-base.txt`, `keys-new.txt`, `pass.txt`
- Temporary: a base worktree `C:\wamp64\www\Hexa-Tech-content-base` (origin/main), local servers on :8012 (API), :5173 (Vite), :8099 (Lighthouse sign-in); all undone in Step 10.

**Interfaces:**
- Consumes: everything Plans 4B-1 and 4B-2 built.
- Produces: the evidence Task 10's question to the owner quotes (suite lines, build lines, `46 screens, 0 differ`, Lighthouse scores, the pass's PASS lines).

- [ ] **Step 1: The frontend suites**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R4C/final-vitest.txt" 2>&1; tail -6 "$R4C/final-vitest.txt"; grep -E '^ FAIL ' "$R4C/final-vitest.txt" | sed 's/ >.*//' | sort -u
npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: `TSC-CLEAN`; `Tests  3 failed | … passed` (more passed than Task 1's baseline), the only `FAIL` file `src/lib/plannerMeta.test.ts`; the lint ends `✖ 17 problems (17 errors, 0 warnings)` (or the baseline Task 1 ledgered). Ledger: `Task 9: note: vitest <n> passed, 3 baseline failures; tsc clean; lint baseline`.

- [ ] **Step 2: Every PHP suite, by folder**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd /c/wamp64/www/Hexa-Tech-content && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R4C/php-paths.txt"; wc -l < "$R4C/php-paths.txt"; rm -f "$R4C/final-php.txt"
"$R4C/php.sh" $(sed -n 1,10p "$R4C/php-paths.txt") | tee -a "$R4C/final-php.txt"      # then 11,20p, 21,30p … to the end, one call each
grep -v "exit 0" "$R4C/final-php.txt"; echo "(nothing above: every path green)"
```

Expected: one line per path (about 72), each `Tests: … passed` and `exit 0`; `tests/Feature/Content/` (194 tests) and `tests/Unit/Content/` (71) among them. A failing path: if its test or the code it covers is in this release's change list (`git diff --name-only 55b0f750f HEAD`), it is ours — fix it test-first, commit, run the path again. If neither is, run it once more alone (this suite has crashes that pass on a second run); if it still fails, ledger `Task 9: note: pre-existing failure <path> <test> — not in the change list` (it goes to the owner and does not block).

- [ ] **Step 3: The build check**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx vite build --outDir "$R4C/build" --emptyOutDir > "$R4C/build.txt" 2>&1; echo "build exit $?"
cd "$R4C/build/assets" && ls ContentApp-*.js AppointmentsApp-*.js
for w in 'Comments and history' 'Waiting for approval' 'Nothing new for you' 'Send for approval'; do printf '%s: ' "$w"; grep -l "$w" *.js | tr '\n' ' '; echo; done
grep -l "data-content\|data-appointments" index-*.js; echo "(no index file listed above)"
cd /c/wamp64/www/Hexa-Tech-content && git checkout -- frontend/dist/stats.html && rm -rf "$R4C/build" && git status --short
```

Expected: `build exit 0`; one `ContentApp-*.js` and one `AppointmentsApp-*.js`; each phrase found only in `ContentApp-*.js`; nothing listed for the index; `git status --short` prints nothing (the visualizer rewrites `frontend/dist/stats.html` whatever the `outDir`; it is restored).

- [ ] **Step 4: Appointments, pixel for pixel, against what is live — no difference**

The base is what production runs now (`origin/main`). Release 4b adds no dependency, so the base borrows the branch's `node_modules` through a junction.

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd /c/wamp64/www/Hexa-Tech-content && git fetch -q origin && git log -1 --format='%h %s' origin/main
git diff --quiet origin/main HEAD -- frontend/package.json frontend/package-lock.json && echo SAME-DEPS
git worktree add --detach ../Hexa-Tech-content-base origin/main
mkdir -p "$R4C/tools" && cp -r .superpowers/sdd/archive/2026-10-16-content-release-4a-2/tools/. "$R4C/tools/"
netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'; echo "ports above must be empty"
```

Expected: origin/main is `4c7514ca4` (or a later commit the ledger names); `SAME-DEPS`. On `ENOSPC`, stop and report it. Then in PowerShell:

```powershell
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

In `$R4C/tools/pixels.mjs` (Edit tool): replace

```js
/** Which tree served the page: only the branch has content/ideas/IdeasPage.tsx (release 4a); origin/main does not. */
async function assertTree(page, which) {
  const branch = await page.evaluate(async () => {
    const r = await fetch('/src/content/ideas/IdeasPage.tsx')
```

with

```js
/** Which tree served the page: only the branch has content/bell/ForYouBell.tsx (release 4b); origin/main does not. */
async function assertTree(page, which) {
  const branch = await page.evaluate(async () => {
    const r = await fetch('/src/content/bell/ForYouBell.tsx')
```

and change `const TOKEN_NAME = 'content-r4a-pixels'` to `const TOKEN_NAME = 'content-r4b-pixels'`.

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
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd "$R4C/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture base && node pixels.mjs capture control && node pixels.mjs compare base control | tail -1
node pixels.mjs keys | tee "$R4C/keys-base.txt" | tail -3
```

Expected: `46 screens, 0 differ` (the method is deterministic) and every keys line `PASS`. If `capture` stops with "no appointment with a client on 2026-09-30", pick a day that has one, use it for every run, and ledger it.

Stop the base Vite (TaskStop); `netstat -ano | grep ':5173 .*LISTENING'` must print nothing (a leftover node PID: check its command line names `Hexa-Tech-content-base`, then `taskkill //PID <pid> //F`). Start the BRANCH's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd "$R4C/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture new; node pixels.mjs compare base new | grep -E '^(DIFF|SIZE|MISSING)|screens'
node pixels.mjs keys | tee "$R4C/keys-new.txt" | tail -3; diff "$R4C/keys-base.txt" "$R4C/keys-new.txt" && echo KEYS-SAME
```

Expected: `46 screens, 0 differ` (release 4b changes nothing in Appointments or the shared workspace core); `KEYS-SAME`. Any differing screen is a defect of this release: find the change (`git diff 55b0f750f HEAD -- frontend/src/workspace frontend/src/appointments` must print nothing), fix it, capture `new` again. Keep the branch's Vite and the API running for Steps 5–6.

- [ ] **Step 5: The browser pass that writes for real — as a manager and as a staff member**

It runs on local org 16, on a temporary brand that is already set up (approvals off), as the manager `appointments-tester@example.test` and as a temporary staff member the seed makes. Write the two PHP files with the Write tool.

`$R4C/pass-seed.php`:

```php
<?php
// Plan 4B-2 browser pass: a set-up brand on local org 16 with approvals OFF (the pass switches them on from the Brand
// page), Instagram every day; a temporary staff member; three posts that member wrote — a draft and an approved post in
// the coming days, and an idea without a day. pass-unseed.php removes the brand, everything under it and the member.
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$org = 16;
$name = 'Release check 4b: approvals, comments and the bell';
$email = 'release-check-4b-staff@example.test';
if (DB::table('brands')->where('organization_id', $org)->where('name', $name)->exists()) { echo "EXISTS\n"; return; }
$now = now();
$today = Carbon\CarbonImmutable::now(App\Services\Appointments\VenueClock::zone($org));
$brand = DB::table('brands')->insertGetId([
    'organization_id' => $org, 'name' => $name, 'slug' => 'release-check-r4b', 'widget_token' => Str::random(32),
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
$profile = App\Models\ContentPlannerProfile::create(['name' => $name, 'brand_id' => $brand, 'default_language' => 'en', 'setup_completed_at' => $now]);
$days = fn (array $on) => array_merge(array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], false), array_fill_keys($on, true));
App\Models\ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'instagram', 'label' => 'Release check Instagram', 'active' => true, 'frequency' => $days(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), 'posts_per_week' => 3, 'post_time' => '08:30']);
$post = fn (array $fields) => App\Models\ContentPlannerPost::create($fields + [
    'planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'instagram', 'language' => 'en', 'generated_by' => 'manual', 'created_by' => $staff->id, 'hashtags' => [],
]);
$post(['status' => 'draft', 'topic' => 'Release check draft', 'scheduled_date' => $today->addDays(2)->toDateString(), 'scheduled_time' => '08:30']);
$post(['status' => 'approved', 'topic' => 'Release check approved', 'hook' => 'Release check original hook', 'scheduled_date' => $today->addDays(3)->toDateString(), 'scheduled_time' => '09:30']);
$post(['status' => 'idea', 'topic' => 'Release check idea']);
echo "BRAND {$brand} PROFILE {$profile->id} STAFF {$staff->id} TODAY {$today->toDateString()}\n";
```

`$R4C/pass-unseed.php`:

```php
<?php
// Removes the release-check brand that pass-seed.php made, every Content row under it (profile, channels, posts, their
// comments, approval steps, briefs and variations, the bell's reads), and the temporary staff member with their tokens.
use Illuminate\Support\Facades\DB;

$email = 'release-check-4b-staff@example.test';
$brand = DB::table('brands')->where('organization_id', 16)->where('name', 'Release check 4b: approvals, comments and the bell')->value('id');
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
    DB::table('admin_access_refusals')->where('user_id', $user)->delete();
    DB::table('staff')->where('user_id', $user)->delete();
    DB::table('users')->where('id', $user)->delete();
    $removed[] = "staff member {$user}";
}
echo $removed ? 'REMOVED ' . implode('; ', $removed) . "\n" : "NOTHING\n";
```

Write `$R4C/tools/pass.mjs` with the Write tool (it replaces 4A-2's):

```js
// Plan 4B-2 release check (Task 9): one browser pass that writes for real on local org 16, on a temporary brand and a
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
const STAFF = 'release-check-4b-staff@example.test'
const TOKEN_NAME = 'content-r4b-pass'
const BRAND_NAME = 'Release check 4b: approvals, comments and the bell'
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
/** A panel field by its label's own words (a filled textarea's words join its label's text: 4A-2's lesson). */
const field = (page, label, tag) => panel(page).locator('label').filter({ has: page.locator(`span:text-is("${label}")`) }).locator(tag)
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
    const draft = await find('Release check draft')
    const approved = await find('Release check approved')
    const idea = await find('Release check idea')
    if (!draft || !approved || !idea) throw new Error('the seeded posts are missing: run pass-unseed.php, then pass-seed.php')

    // A manager switches approvals on (Brand → Approvals).
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content/brand`)
      const approvals = section(page, 'Approvals')
      await approvals.waitFor({ timeout: 30_000 })
      const toggle = approvals.getByRole('switch', { name: 'Posts need a manager’s approval' })
      record('A1 Approvals start off for the brand', (await toggle.getAttribute('aria-checked')) === 'false')
      await toggle.click()
      record('A2 a manager switches approvals on', await until(async () => (await api(manager, `brand?brand_id=${brand}`)).profile?.requires_approval === true))
      await approvals.scrollIntoViewIfNeeded()
      await shot(page, 'brand-approvals')
      await context.close()
    }
    // The staff member under the rule: the panel, a comment, the board.
    {
      const { context, page } = await session(browser, staff, { brand })
      await page.goto(`${APP}/content?date=${draft.scheduled_date}`)
      await ready(page)
      await page.locator(`[data-post="${draft.id}"]`).first().click()
      const statusSelect = field(page, 'Status', 'select')
      await statusSelect.waitFor({ timeout: 30_000 })
      const options = await statusSelect.locator('option').allTextContents()
      record('S1 a staff member’s status list stops before Approved, Ready and Published',
        options.includes('Needs review') && !options.includes('Approved') && !options.includes('Ready') && !options.includes('Published'), options.join('/'))
      record('S2 Mark ready and Mark published are not offered, and the panel says who does them',
        (await panel(page).getByRole('button', { name: 'Mark ready' }).count()) === 0
        && (await panel(page).getByRole('button', { name: 'Mark published' }).count()) === 0
        && await panel(page).getByText('While approvals are on, a manager approves, marks ready and publishes.').isVisible())
      await panel(page).getByRole('button', { name: 'Send for approval' }).click()
      record('S3 Send for approval puts the post in review, and the panel says it waits', await until(async () => (await postOf(draft.id))?.status === 'needs_review')
        && await until(() => panel(page).getByText('Waiting for approval').first().isVisible()))
      const box = panel(page).getByLabel('Write a comment')
      await box.fill('Release check comment')
      await box.press('Enter')
      record('S4 Enter sends a comment: it joins the timeline and the box empties',
        await until(async () => ((await postOf(draft.id))?.timeline ?? []).some(i => i.type === 'comment' && i.body === 'Release check comment'))
        && await until(async () => (await box.inputValue()) === ''))
      await shot(page, 'panel-staff-waiting')
      await panel(page).getByRole('button', { name: 'Close' }).click()
      await page.goto(`${APP}/content/ideas`)
      const card = page.locator(`[data-ideas] li:has([data-post="${idea.id}"])`)
      await card.waitFor({ timeout: 30_000 })
      await card.dragTo(page.locator('[data-column="ready"]'))
      await page.waitForTimeout(1500)
      record('S5 a card dragged to Ready stays where it was', (await postOf(idea.id))?.status === 'idea')
      await card.getByRole('button', { name: 'Move to…' }).click()
      const moves = await card.locator('[data-menu] ul button').allTextContents()
      record('S6 "Move to…" offers no Ready', moves.length > 0 && !moves.some(m => m.includes('Ready')), moves.join('/'))
      await page.keyboard.press('Escape')
      await context.close()
    }
    // The manager: the bell, a line that opens its post, Send back with a note.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content?date=${draft.scheduled_date}`)
      await ready(page)
      record('M1 the manager’s bell counts what waits and the news', await until(async () => /^For you \(\d+\)$/.test((await bell(page).getAttribute('aria-label')) ?? '')),
        String(await bell(page).getAttribute('aria-label')))
      await bell(page).click()
      const lines = bellList(page)
      record('M2 the list shows the post waiting for approval and the staff member’s comment', await until(async () => {
        const text = await lines.innerText()
        return text.includes('Waiting for approval: Release check draft') && text.includes('commented: Release check draft')
      }))
      await shot(page, 'bell-manager')
      await lines.getByRole('button', { name: /Waiting for approval: Release check draft/ }).click()
      await panel(page).getByRole('button', { name: 'Approve', exact: true }).waitFor({ timeout: 30_000 })
      record('M3 a line opens its post, with Approve and Send back', await panel(page).getByRole('button', { name: 'Send back', exact: true }).first().isVisible())
      await panel(page).getByRole('button', { name: 'Send back', exact: true }).first().click()
      await panel(page).getByLabel('What should change? The writer sees this.').fill('Release check: shorter, please.')
      await panel(page).getByRole('button', { name: 'Send back', exact: true }).last().click()
      record('M4 Send back with a note returns the post to Draft, sent back', await until(async () => {
        const p = await postOf(draft.id)
        return p?.status === 'draft' && p?.sent_back === true
      }))
      record('M5 the timeline shows the send-back with its note', await until(() => panel(page).getByText('Release check: shorter, please.').first().isVisible()))
      await shot(page, 'panel-manager-sent-back')
      await context.close()
    }
    // The staff member hears it, then changes an approved post's words.
    {
      const { context, page } = await session(browser, staff, { brand })
      await page.goto(`${APP}/content?date=${approved.scheduled_date}`)
      await ready(page)
      await bell(page).click()
      record('S7 the staff member’s bell says the post was sent back, with the note', await until(async () => {
        const text = await bellList(page).innerText()
        return text.includes('sent back: Release check draft') && text.includes('Release check: shorter, please.')
      }))
      await shot(page, 'bell-staff')
      await page.keyboard.press('Escape')
      await page.locator(`[data-post="${approved.id}"]`).first().click()
      const hook = field(page, 'Hook', 'textarea')
      await hook.waitFor({ timeout: 30_000 })
      await hook.fill('Release check: a new hook')
      await panel(page).getByRole('button', { name: 'Save', exact: true }).click()
      record('S8 a staff change to an approved post’s words sends it back to review', await until(async () => (await postOf(approved.id))?.status === 'needs_review'))
      await context.close()
    }
    // The manager approves it, as read.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content?date=${approved.scheduled_date}`)
      await ready(page)
      await page.locator(`[data-post="${approved.id}"]`).first().click()
      const approve = panel(page).getByRole('button', { name: 'Approve', exact: true })
      await approve.waitFor({ timeout: 30_000 })
      await approve.click()
      record('M6 Approve approves the post as the manager read it', await until(async () => (await postOf(approved.id))?.status === 'approved'))
      record('M7 its card no longer says it waits', await until(async () =>
        (await page.locator(`[data-post="${approved.id}"]`).first().getAttribute('aria-label'))?.includes('Waiting for approval') === false))
      await context.close()
    }
    // Phones: the staff member's panel with its timeline; the bell in Russian.
    {
      const phone = await session(browser, staff, { brand, width: 390, height: 844, mobile: true })
      await phone.page.goto(`${APP}/content?date=${draft.scheduled_date}`)
      await ready(phone.page)
      await phone.page.locator(`[data-post="${draft.id}"]`).first().click()
      const title = phone.page.getByText('Comments and history')
      await title.waitFor({ timeout: 30_000 })
      await title.scrollIntoViewIfNeeded()
      const fits = await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      await shot(phone.page, 'panel-timeline-phone')
      record('P1 on a phone the panel’s timeline fits, nothing off the screen', fits)
      await phone.context.close()
    }
    {
      const phone = await session(browser, manager, { brand, lang: 'ru', width: 390, height: 844, mobile: true })
      await phone.page.goto(`${APP}/content`)
      await bell(phone.page).waitFor({ timeout: 30_000 })
      await bell(phone.page).click()
      await phone.page.waitForTimeout(1500)
      const fits = await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      await shot(phone.page, 'bell-ru-phone')
      record('P2 the bell’s list fits a phone in Russian', fits)
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
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R4C/pass-seed.php" < /dev/null | tail -1
cd "$R4C/tools" && node pass.mjs | tee "$R4C/pass.txt" | tail -30
```

Expected: the jobs count noted (ledger it); `BRAND <id> PROFILE <id> STAFF <id> TODAY <date>`; every line `PASS`, `console errors: 0`, `19 checks, 0 failed`. A FAIL: read the line and the screenshot; a defect of the portal is fixed test-first (a component or helper test that fails, then passes), committed, and the pass run again (run `pass-unseed.php` and `pass-seed.php` first, so it starts from the same brand). A defect of the script (a selector the page does not have, a wait that is too short) is fixed in the script and ledgered `Task 9: Ruling: pass script <what> — <why the page is right>`.

- [ ] **Step 6: Lighthouse accessibility on the Plan, the bell, Ideas, the panel and Brand**

In `$R4C/tools/token-server.mjs` (copied from 4A-2 in Step 4; Edit tool): change `const NAME = 'content-r4a-lighthouse'` to `const NAME = 'content-r4b-lighthouse'` and `const BRAND_NAME = 'Release check 4a: key dates, ideas and templates'` to `const BRAND_NAME = 'Release check 4b: approvals, comments and the bell'`.

Write `$R4C/tools/lh.mjs` with the Write tool (it replaces 4A-2's; the chrome-devtools MCP's Chrome profile may be held by another session, so this runs Lighthouse on a Chrome of its own, as 4A-2 ruled):

```js
// Plan 4B-2 release check (Task 9, Step 6): Lighthouse accessibility on the Plan (the bell in the header), the bell's open
// list, Ideas, the panel with its timeline and Brand (Approvals), on a Chrome of our own, in snapshot mode once each
// page's content is on screen. The sign-in comes from token-server.mjs (port 8099): the manager, on the release-check brand.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(HERE, '../lighthouse')
const CACHE = 'C:/Users/user6399/AppData/Local/npm-cache/_npx/1722e863ebfd623b/node_modules'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const APP = 'http://localhost:5173'
const DAY = process.argv[2]
if (!DAY) throw new Error('usage: node lh.mjs <the draft post’s day, YYYY-MM-DD>')

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
  const waitText = text => page.waitForFunction(t => document.body.innerText.includes(t), { timeout: 60_000 }, text)
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
  await page.waitForSelector('[data-menu]:has([data-bell]) ul li', { timeout: 60_000 })
  await audit('bell')
  await page.keyboard.press('Escape')

  await page.goto(`${APP}/content/ideas`)
  await page.waitForSelector('[data-ideas] [data-post]', { timeout: 60_000 })
  await audit('ideas')

  await page.goto(`${APP}/content?date=${DAY}`)
  await page.waitForSelector('[data-post]', { timeout: 60_000 })
  await page.click('[data-post]')
  await waitText('Comments and history')
  await audit('panel')

  await page.goto(`${APP}/content/brand`)
  await waitText('Approvals')
  await audit('brand')
} finally {
  await browser.close()
}
fs.writeFileSync(path.resolve(HERE, '../lighthouse.md'), `# Plan 4B-2 release check — Lighthouse accessibility (snapshot mode, desktop 1440)\n\n${lines.join('\n')}\n`)
```

The release-check brand from Step 5 is still there (approvals on, posts with comments and steps). Start `node "$R4C/tools/token-server.mjs"` in the background (it prints only `serving on 127.0.0.1:8099`), then run `cd "$R4C/tools" && node lh.mjs <the draft's day from the pass: TODAY + 2>`. Stop the token server (TaskStop) and run `node "$R4C/tools/token-server.mjs" drop` → `dropped`.

Read `$R4C/lighthouse.md`: per page the accessibility score and every failing audit with its elements. Expected: no failing audit the portal can fix. Each one it can is a defect: fix it test-first (a component test that renders the element and checks the missing name, role or contrast token), commit, and audit that page again. One the portal cannot fix (a browser extension, the dev server's overlay) gets `Task 9: Ruling: <audit> — <why it is not the portal's> — <cost if wrong>`. No conformance is claimed.

- [ ] **Step 7: Eyes**

Open every screenshot in `$R4C/shots/pass/` with the Read tool and write one line each in `$R4C/eyes.md`:
- `brand-approvals.png`: the Approvals section after Key dates — the title, the line under it, the switch on, the "On: …" line.
- `panel-staff-waiting.png`: the review bar at the panel's top ("Written by Release Check Staff", "Waiting for approval"); the status select without Approved / Ready / Published; no Mark ready or Mark published, the hint line instead; "Comments and history" at the foot with the comment, the box and its hint.
- `bell-manager.png`: the bell beside New post with its count badge; the list under it, right-aligned, inside the window: "Waiting for approval: Release check draft" and the comment line, news tinted with a dot.
- `panel-manager-sent-back.png`: the review bar with "Sent back"; the timeline's grey lines (sent for approval, sent back) with the note in italics; the success line.
- `bell-staff.png`: the staff member's list with "… sent back: Release check draft" and the note beneath.
- `panel-timeline-phone.png`: the panel full width at 390, the timeline and the box fitting, nothing cut.
- `bell-ru-phone.png`: the Russian bell list on a phone, within the screen, lines cut with "…" rather than overflowing.

Anything that looks wrong to a person is a defect: fix it (test-first where a test can hold it), take the screenshot again, and say so in `eyes.md`.

- [ ] **Step 8: The suites again if anything was fixed**

If Steps 2–7 committed any fix, run Step 1 again and the PHP paths those fixes touch (`"$R4C/php.sh" <paths>`). Expected: as in Steps 1–2.

- [ ] **Step 9: Ledger**

Append to `$R4C/progress.md`: `Task 9: note: vitest …; PHP <n> paths green (<pre-existing failures, if any>); build check clean; Appointments 46 screens, 0 differ, keys same; Lighthouse <Plan / bell / Ideas / panel / Brand>; pass 19 checks 0 failed; eyes ok`.

- [ ] **Step 10: Clean up**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R4C/pass-unseed.php" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo Laravel\Sanctum\PersonalAccessToken::where('name', 'like', 'content-r4b-%')->count();" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan workspace:content 16 --status < /dev/null | tail -2
```

Expected: `REMOVED brand <id>, profiles 1, posts 3; staff member <id>`; tokens `0`; jobs as noted before the pass; org 16's Content `on`. Stop the API and the Vite tasks (TaskStop); `netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'` must print nothing (a leftover node PID: check its command line, then `taskkill //PID <pid> //F`). Remove the base worktree — junction first, in PowerShell:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove ../Hexa-Tech-content-base && git worktree list | grep -c content-base; test -d frontend/node_modules/react && echo MODULES-KEPT; git status --short
```

Expected: `0`; `MODULES-KEPT`; `git status --short` prints nothing.

- [ ] **Step 11: Record the task**

```bash
cd /c/wamp64/www/Hexa-Tech-content && bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/executing-plans/scripts/task-done docs/superpowers/plans/2026-10-18-content-release-4b-2.md 9 <BASE> -- .superpowers/sdd/2026-10-18-content-release-4b-2/vt.sh src/content src/workspace src/appointments
```

---

### Task 10: The deploy (source-patch recipe), after the owner's "yes, deploy"

Run this task after the final whole-branch review and its fix pass (executing-plans' Final Review), so the feature tip it ships is final.

Merging to `main` is a production deploy: Laravel Cloud runs `migrate --force` (release 4b brings four additive migrations) and rebuilds the SPA. This task prepares the artifact in its own worktree, proves it, then **stops and asks the owner**. Nothing is pushed without the owner's explicit "yes, deploy" in this conversation; release 4a's yes does not carry over.

**Files:**
- Temporary: worktree `C:\wamp64\www\Hexa-Tech-deploy-content-r4b` on branch `deploy/content-r4b` (from `origin/main`), with a copied `vendor`, the local `.env` and a `frontend/node_modules` junction; removed in Step 9 (the branch is kept).
- Ledger: `$R4C/deploy-list.txt`, `$R4C/deploy-php.txt`, `$R4C/deploy-vitest.txt`, `$R4C/deploy-build.txt`, `$R4C/postdeploy.txt`.

**Interfaces:**
- Consumes: the feature tip after the review and Task 9 (`TIP`), the last deployed feature tip `55b0f750f`, prod main `4c7514ca4`, `$R4C/php.sh`.

- [ ] **Step 1: Fix the inputs**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git status --short && git fetch -q origin
TIP=$(git rev-parse HEAD); echo "TIP $TIP"; git log -1 --format='%h %s' origin/main
git diff --stat 55b0f750f origin/main -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: a clean status; origin/main `4c7514ca4`; the last line prints nothing (production's source is exactly the last deployed feature tip). If origin/main moved on, the line lists what changed there: Step 3's fourth guard proves none of it touches this release's files; ledger the new origin/main.

Ledger: `Task 10: note: TIP <sha>; origin/main <sha>`.

- [ ] **Step 2: The deploy worktree**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree add ../Hexa-Tech-deploy-content-r4b -B deploy/content-r4b origin/main
cp .env ../Hexa-Tech-deploy-content-r4b/.env
```

In PowerShell (robocopy, never a junction for `vendor`: PHPUnit would test the other tree; robocopy's exit codes 0–7 mean success):

```powershell
robocopy C:\wamp64\www\Hexa-Tech-content\vendor C:\wamp64\www\Hexa-Tech-deploy-content-r4b\vendor /E /NFL /NDL /NJH /NJS /NP; if ($LASTEXITCODE -lt 8) { 'VENDOR-OK' }
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-deploy-content-r4b\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

Expected: `VENDOR-OK`; the junction made. On `ENOSPC` (or robocopy's "not enough space"), stop and report it; delete nothing to make room.

- [ ] **Step 3: The change list and its guards**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd /c/wamp64/www/Hexa-Tech-content && git diff --no-renames --name-status 55b0f750f "$TIP" > "$R4C/deploy-list.txt"; wc -l < "$R4C/deploy-list.txt"
cut -f2 "$R4C/deploy-list.txt" | grep -vE '^(app/|routes/api\.php$|tests/|frontend/src/|docs/|database/migrations/2026_10_18_100(000|100|200|300)_)'; echo "(nothing above: every path is in the allowlist)"
cut -f2 "$R4C/deploy-list.txt" | grep -E '^(frontend/dist/|public/spa/|resources/spa-shell/|config/|composer\.|frontend/package)'; echo "(nothing above: no built file, no config, no dependency)"
cut -f2 "$R4C/deploy-list.txt" | grep '^database/'; echo "(above: exactly the four release-4b migrations)"
git diff --name-only 4c7514ca4 origin/main -- $(cut -f2 "$R4C/deploy-list.txt"); echo "(nothing above: production has not changed any file of this release since 4c7514ca4)"
cut -f1 "$R4C/deploy-list.txt" | sort | uniq -c
```

Expected: about 90 lines; the first two guards print nothing but their notes; the third lists exactly `database/migrations/2026_10_18_100000_add_requires_approval_to_content_planner_profiles.php`, `…100100_create_content_planner_post_events_table.php`, `…100200_create_content_planner_post_comments_table.php` and `…100300_create_content_planner_reads_table.php`; the fourth prints nothing; the status count shows `A` and `M` only (release 4b deletes nothing). A path outside the allowlist: stop and find out why before going on (another feature's commit must not ride the deploy); ledger the answer.

- [ ] **Step 4: Apply, check parity, commit**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4b
awk -F'\t' '$1 != "D" {print $2}' "$R4C/deploy-list.txt" > "$R4C/deploy-am.txt"
awk -F'\t' '$1 == "D" {print $2}' "$R4C/deploy-list.txt" > "$R4C/deploy-d.txt"
xargs -a "$R4C/deploy-am.txt" git checkout "$TIP" --
[ -s "$R4C/deploy-d.txt" ] && xargs -a "$R4C/deploy-d.txt" git rm -q --
git diff --cached --stat | tail -1
git diff --cached "$TIP" -- $(cut -f2 "$R4C/deploy-list.txt") | head -5; echo "(nothing above: parity with the feature tip, deletions included)"
git diff "$TIP" --stat -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: the cached stat counts every line of the list; the parity diff prints nothing; when origin/main was still `4c7514ca4`, the last line prints nothing too (whole-tree parity with the feature tip outside the built files).

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4b && git commit -q -F - <<'EOF'
HexaTech Content, release 4b: approvals, comments and history, the For you bell

A per-brand approval switch (off by default, managers switch it): while on,
staff write, edit and send posts for approval and only managers approve,
mark ready and publish, on every write path; Approve takes the version the
manager read. Comments and approval history in one timeline at the post
panel's foot; card flags (waiting, sent back, comment count); the For you
bell in the header (waiting approvals for managers, approvals and comments
for writers and commenters, per brand). Four additive migrations
(profiles.requires_approval, content_planner_post_events,
content_planner_post_comments, content_planner_reads). Source of
feature/content-workspace at TIP_SHA (since 55b0f750f).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='%h %s'
```

(Before committing, replace `TIP_SHA` in the message with the short sha of `$TIP`, by editing the command.)

- [ ] **Step 5: Every suite on the artifact**

The PHP suites, by folder, on the deploy worktree, in batches of about ten per call (`php.sh` runs in the feature worktree, so for the artifact use a copy that runs in the deploy tree):

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
sed 's#cd /c/wamp64/www/Hexa-Tech-content #cd /c/wamp64/www/Hexa-Tech-deploy-content-r4b #' "$R4C/php.sh" > "$R4C/php-deploy.sh" && chmod +x "$R4C/php-deploy.sh" && grep -n "^cd " "$R4C/php-deploy.sh"
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4b && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R4C/deploy-paths.txt"; wc -l < "$R4C/deploy-paths.txt"; rm -f "$R4C/deploy-php.txt"
"$R4C/php-deploy.sh" $(sed -n 1,10p "$R4C/deploy-paths.txt") | tee -a "$R4C/deploy-php.txt"     # then 11,20p … to the end
grep -v "exit 0" "$R4C/deploy-php.txt"; echo "(nothing above: every path green)"
```

Expected: the `grep -n` line shows `cd /c/wamp64/www/Hexa-Tech-deploy-content-r4b || exit 1`; every PHP path `exit 0` (the same paths and results as Task 9; a pre-existing failure Task 9 recorded may repeat, nothing new).

The frontend, and the build:

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4b/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R4C/deploy-vitest.txt" 2>&1; tail -5 "$R4C/deploy-vitest.txt"; grep -E '^ FAIL ' "$R4C/deploy-vitest.txt" | sed 's/ >.*//' | sort -u
npm run build > "$R4C/deploy-build.txt" 2>&1; echo "build exit $?"; tail -5 "$R4C/deploy-build.txt"
cd .. && git status --short | cut -c4- | cut -d/ -f1-2 | sort | uniq -c
```

Expected: `TSC-CLEAN`; vitest `3 failed` only in `src/lib/plannerMeta.test.ts`; `build exit 0`; the status shows changes only under `frontend/dist`, `public/spa` and `resources/spa-shell`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4b && git add frontend/dist public/spa resources/spa-shell && git commit -q -m "Build the SPA for HexaTech Content release 4b" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git status --short && git log -3 --format='%h %s'
```

Expected: a clean status; the build commit on top of the source commit, on top of origin/main.

- [ ] **Step 6: STOP — ask the owner**

Ledger `Task 10: note: artifact ready — deploy/content-r4b <sha> (source <sha> + build <sha>), <n> files (A <a>, M <m>), PHP <n> paths green, vitest <n> passed + 3 baseline, build ok`, then ask the owner, with the facts in plain words:

- what ships: Brand → Approvals (per brand, off by default, managers switch it); while on, staff write, edit and send posts for approval and only managers approve, mark ready and publish (the server refuses the rest on every path; the portal hides it); the panel's review bar (Written by, Waiting for approval / Sent back, Send for approval, Approve, Send back with a note; Approve refuses words changed since they were read); Comments and history at the panel's foot; card flags with comment counts; the "For you" bell in the header;
- the four additive migrations (`content_planner_profiles.requires_approval`, `content_planner_post_events`, `content_planner_post_comments`, `content_planner_reads`): nothing existing changes;
- what changes for people: comments, flags and the bell for everyone at once; nothing about approvals until a manager switches them on for a brand; admin tabs left open across the deploy must be reloaded;
- the three questions still open (the plan kept the server as built): a deactivated member keeps their name on comments and history; "Sent back" ends on any change to the post; the portal does not offer Send for approval again on a post already in review;
- the queue check from the runbook, still open: `retry_after` is 90 s while the strategy job may run 600 s;
- the checks: Task 9's results (suites, `46 screens, 0 differ`, Lighthouse, the browser pass as manager and staff) and Step 5's;
- the question: **"Shall I deploy? Reply 'yes, deploy' to push it to production."**

Wait for the answer. Anything other than a clear yes: do not push; keep the deploy worktree, and do what the owner asks.

- [ ] **Step 7: Push (only after "yes, deploy")**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4b && git fetch -q origin && git log -1 --format='%h' origin/main
OLD=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "OLD $OLD" | tee "$R4C/postdeploy.txt"
for u in /api/v1/admin/content/inbox/count /api/v1/admin/content/bootstrap; do printf 'before %s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: application/json' "https://app.hexa-tech.uk$u")"; done | tee -a "$R4C/postdeploy.txt"
```

Expected: origin/main is still the commit the deploy branch was cut from (if it moved, stop: rebase nothing, tell the owner and start again from Step 1); `OLD /spa/assets/index-….js`; `before /api/v1/admin/content/inbox/count 404` and `before /api/v1/admin/content/bootstrap 401`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r4b && git push origin deploy/content-r4b:main 2>&1 | tail -2; date -u +%FT%TZ
```

Then wait for Laravel Cloud's new bundle (Bash, `run_in_background`; it re-invokes when it exits; about 2–3 minutes in earlier releases):

```bash
OLD='<the OLD path from above>'; for i in $(seq 1 60); do NEW=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); [ -n "$NEW" ] && [ "$NEW" != "$OLD" ] && { echo "NEW $NEW at $(date -u +%T)"; exit 0; }; sleep 15; done; echo "STILL OLD after 15 minutes"; exit 1
```

Expected: `NEW /spa/assets/index-….js`. "STILL OLD": look at the Laravel Cloud deploy log with the owner (a failed migration stops the deploy); do not push again.

- [ ] **Step 8: Verify by content**

```bash
R4C=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-18-content-release-4b-2
B=https://app.hexa-tech.uk; NEW=$(curl -s $B/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "NEW $NEW" | tee -a "$R4C/postdeploy.txt"
curl -s "$B$NEW" -o "$R4C/live-index.js"; printf 'index data-content/data-appointments: %s\n' "$(grep -c 'data-content\|data-appointments' "$R4C/live-index.js")" | tee -a "$R4C/postdeploy.txt"
CA=$(grep -o 'ContentApp-[A-Za-z0-9_-]*\.js' "$R4C/live-index.js" | head -1); AA=$(grep -o 'AppointmentsApp-[A-Za-z0-9_-]*\.js' "$R4C/live-index.js" | head -1); echo "chunks $CA $AA" | tee -a "$R4C/postdeploy.txt"
curl -s "$B/spa/assets/$CA" -o "$R4C/live-content.js"; for w in 'Comments and history' 'Waiting for approval' 'Nothing new for you' 'Send for approval'; do printf 'ContentApp has "%s": %s\n' "$w" "$(grep -c "$w" "$R4C/live-content.js")"; done | tee -a "$R4C/postdeploy.txt"
curl -s "$B/spa/assets/$AA" | grep -c 'data-appointments' | sed 's/^/AppointmentsApp has data-appointments: /' | tee -a "$R4C/postdeploy.txt"
for u in /api/v1/admin/content/inbox/count /api/v1/admin/content/bootstrap; do printf 'after %s %s %s\n' "$u" "$(curl -s -o "$R4C/body.json" -w '%{http_code}' -H 'Accept: application/json' "$B$u")" "$(head -c 80 "$R4C/body.json")"; done | tee -a "$R4C/postdeploy.txt"
for p in / /content /content/ideas /content/brand /appointments; do printf 'page %s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done | tee -a "$R4C/postdeploy.txt"
rm -f "$R4C/live-index.js" "$R4C/live-content.js" "$R4C/body.json"
```

Expected: `index data-content/data-appointments: 0`; both chunk names found; the ContentApp chunk has each of the four phrases (counts ≥ 1); `AppointmentsApp has data-appointments:` ≥ 1; `after /api/v1/admin/content/inbox/count 401 {"message":"Unauthenticated."…` (it answered 404 before) and `after /api/v1/admin/content/bootstrap 401`; the five pages `200`. Any other answer: tell the owner at once, with the line.

- [ ] **Step 9: Clean up and record**

In PowerShell, the junction first, then the worktree:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-deploy-content-r4b\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove --force ../Hexa-Tech-deploy-content-r4b && git worktree list | grep -c deploy-content-r4b; test -d frontend/node_modules/react && echo MODULES-KEPT
```

Expected: `0`; `MODULES-KEPT`. (`--force` because the copied `vendor` and `.env` are untracked files in it; the branch `deploy/content-r4b` stays.)

Ledger: `Task 10: complete — LIVE as prod main <sha> (source <sha> + build <sha>; <n> files) pushed <time>Z, new index live <time>Z (<index>, <ContentApp chunk>); verified by content (postdeploy.txt): …`.

Update the memory file `content-workspace.md` and its line in `MEMORY.md`: release 4b LIVE as prod main `<sha>` (date), verified by content; the owner's checks still open (the runbook's "After the deploy" lines for releases 2, 3, 4a and 4b, the queue `retry_after` check, the three approval questions); release 4 complete; release 5 next (versions per platform, reminder, tracked links, link-in-bio).

Tell the owner it is live, with the verification lines and the runbook's "After the deploy" checks.
