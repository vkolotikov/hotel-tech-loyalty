# HexaTech Content — the Content Planner as its own workspace

Status: design agreed with the owner section by section (2026-10-14); written spec awaiting the owner's review.
Reference pattern: HexaTech Appointments (`/appointments`, `docs/appointments-workspace.md`, Atelier look).

## 1. Why

The AI Content Planner works, but it lives as one tab of the full admin's Marketing hub
(`/marketing?tab=content-planner`): English only, tabs held in memory (no links), a Dashboard that repeats the
calendar, an 8-step wizard that must be re-run to change one answer, and no drag on the calendar. The owner wants
it to become a product experience of its own, at the level of HexaTech Appointments: its own address, its own
calm and premium design, a daily flow built around the week, in five languages, over the same data.

## 2. Owner decisions (binding)

| # | Decision | When |
|---|----------|------|
| D1 | Scope of the first release: **new home + daily flow**. Every current feature rebuilt into the portal around the calendar (drag to reschedule, real links, Find, 5 languages) and the known defects fixed. Approvals, publishing, campaigns are later parts. | 2026-10-14 |
| D2 | Roles: **managers set up, staff write** (table in §5.1). | 2026-10-14 |
| D3 | Name and address: **HexaTech Content** at **`/content`**. | 2026-10-14 |
| D4 | Main screen: **week calendar + post panel**; month and list one click away. | 2026-10-14 |
| D5 | Look: **Atelier sibling** — same fonts, side rail, Light/Dark/Auto and brand accent as Appointments, with Content's own touches. | 2026-10-14 |
| D6 | Who has it: **every organisation, as today**. No plan limits in this release; AI spend counts toward each organisation's monthly AI cap. | 2026-10-14 |
| D7 | Approach **A · shared core**: generic shell parts move out of Appointments into a shared folder both workspaces use. | 2026-10-14 |
| D8 | Sections 1–5 approved as presented, including **two deploys** (shared core first, invisible; then Content), each waiting for the owner's "yes, deploy". | 2026-10-14 |

Earlier rulings that still bind: text on a coloured fill is white while white reads ≥ 3:1 on it, else dark ink
(owner, 2026-10-09); FILLS use the brand colour, LINES and TEXT use the readable accent (`--a-accent-text`);
owner-only UI is gated on the server's `isPlatformAdmin`, never on staff role `super_admin`; a "way in" that reads
the stored session user must refresh it from `/v1/auth/me`.

## 3. Non-goals (this release)

- No approvals, comments or review flow (the `needs_review` / `approved` statuses stay as plain statuses).
- No publishing to social networks; "Mark published" stays manual with a URL.
- No campaigns or media-library screens (their tables stay unused); no trend module.
- No plan limits and no AI model allowlist (`ai_allowed_models`) for Content — both belong to a later
  "sell on its own" part.
- No change to how the AI writes (prompts, models, the calendar's 240 s budget and week chunks) beyond recording
  its spend and the fixes in §7.
- No change to Appointments' behaviour or look (proved by its tests and a screenshot comparison, §9).
- No new UI or animation library (no Radix/shadcn, no Framer Motion); no new database table, no migration.

## 4. The portal — screens and daily flow

Atelier frame from the shared core (§6.1): ink side rail (full or slim, remembered per device), top bar, notices.

### 4.1 Rail

Plan · Posts · Strategy · Brand. Footer: Light/Dark/Auto, language, **Full admin**, sign out. Staff see every page;
manager-only actions are absent for them (§5.1).

### 4.2 Plan — home (`/content`)

- **Week view** (default): seven day columns, Monday first, on the venue's clock (§6.8). Posts stacked by time
  (untimed first). A **card** shows the platform mark and colour, time, hook (or title, or topic), a status dot,
  and the image thumbnail when the post has an image.
- **This week strip**: planned · ready · published · empty slots, for the shown week.
  Planned = posts dated in the week, not `skipped`/`archived`. Ready = `ready_to_publish`. Published = `published`.
  Empty = open slots (§6.6) from today to the week's end.
- **Empty slot** (a day + platform the brand's own channel days expect, with no post): shows **Write** (new post
  for that day and platform) and **Fill with AI** (one AI-written post for that slot, §5.2).
- **Unscheduled tray**: posts without a date. Drag a post from the tray to a day to schedule it; drag a card onto
  the tray to clear its date.
- **Drag to move** a card to another day (week or month view); the time is kept. Drop saves at once and shows a
  notice "Moved to Thu 16 Oct · Undo" for 8 seconds. **Keyboard**: a focused card moves a day with Shift+←/→
  (same save + Undo; Alt+arrows stay the browser's Back/Forward). Published posts cannot be moved (their date is
  the record of when they went out).
- **Month view** and **List view** (chronological, grouped by day) one click away; filters: platform chips, status.
- **Generate** (managers): a dialog for this week / next week / this month / a custom range (≤ 62 days), platforms,
  "empty slots only" (on by default) and instructions; reports filled and unfilled days as today.
- Below 1024 px the Plan shows the List view (as Appointments).
- Refetch every 60 s and when the window regains focus.

### 4.3 Post panel

Slides in over the current page; Escape or ✕ closes it. Shareable link **`/content/posts/:id`** opens the post's
week on Plan with the panel open (an unscheduled post opens on Posts).

- Fields: platform, date and time, status, pillar, audience, language, topic, hook, main copy, CTA, hashtags.
- AI tools: write copy, five rewrites (shorter, longer, professional, friendly, alternative) with an optional
  guidance line, quality score, visual brief, image (generate, regenerate, download).
- Actions: Mark ready, Mark published (URL), duplicate, copy text, delete (with a confirm).
- Save is explicit, as today; leaving with unsaved edits asks first. A stale save is refused (§7, F3).

### 4.4 Posts (`/content/posts`)

Every post of the active brand: search (title, topic, hook, copy), filters (status, platform, pillar, date range,
unscheduled), 50 per page, newest scheduled first. A row opens the panel.

### 4.5 Strategy (`/content/strategy`)

- The active strategy, read as today: positioning, audience map, pillars, content mix, weekly rhythm, platform
  playbooks, risks, next actions.
- **Pillar balance**: this month's posts per pillar against the pillars' target weights (moved from the old
  Dashboard).
- Managers: generate a new strategy (queued job with progress, as today), see past strategies, make one active,
  archive one. One generation at a time per brand.

### 4.6 Brand (`/content/brand`)

- The brand profile in sections, each with its own Edit/Save (managers): Knowledge & readiness, Brand DNA,
  Audiences, Voice, Positioning, Channels (platform, days, posts per week, rules), Rhythm & goals.
- Readiness score with what is missing; **Refresh knowledge** re-reads the organisation's FAQ, chatbot and services.
- A brand with no profile yet: managers choose **Quick setup** (one AI call, as today) or **Guided setup** (the
  same section editors one after another, draft kept per brand on the device); staff see "Your manager has not set
  up this brand yet" and the Plan stays empty.

### 4.7 Header, Find, shortcuts

- Organisation name; the active brand with a **brand switcher** only when the user may use more than one brand
  (§6.7). The portal always works on exactly one brand.
- **Find** (Ctrl/⌘ K or "/"): the active brand's posts by title, topic, hook or copy (up to 8), plus jumps to
  Plan, Posts, Strategy, Brand.
- **New post** button; an **AI budget** notice when the organisation is at ≥ 80 % of its monthly AI cap; the
  "Content is switched off" notice (§8.2).
- Shortcuts: N new post · T this week · ←/→ previous/next week or month · W/M/L week/month/list · / or Ctrl K Find
  · ? help sheet · Escape closes the panel. Physical-key fallback for Cyrillic layouts from the shared engine.

The old Dashboard tab is retired: its numbers live in the This week strip, its pillar balance on Strategy, its
setup gaps on Brand.

## 5. Roles and AI spend

### 5.1 Who can do what

Managers = staff role `super_admin` or `manager` in this organisation (the tenant-scoped rule Appointments uses,
`SetupAccess::MANAGER_ROLES`). Staff = every other active staff member.

| Action | Staff | Managers |
|---|---|---|
| Open the portal; read Plan, Posts, Strategy, Brand | ✓ | ✓ |
| Create, edit, move, duplicate, delete posts; mark ready / published | ✓ | ✓ |
| AI on one post: Fill a slot, write copy, rewrites, quality score, visual brief, image | ✓ | ✓ |
| Generate a week, month or range with AI | — | ✓ |
| Generate, activate or archive a strategy | — (read) | ✓ |
| Edit the brand profile, audiences, voice, channels, rhythm; Quick / Guided setup; Refresh knowledge | — (read) | ✓ |

Enforced on the server (`ContentAccess::requireManager`, 403 `manager_only`); the screens never show a staff member
a button the server would refuse.

### 5.2 AI spend

- Every AI call the portal causes (post text, rewrites, quality, visual brief, Fill a slot, calendar generation,
  strategy, quick setup, images) is recorded in the shared ledger through `AiUsageService::recordUsage` with
  feature `content`, so it appears in Settings → AI Usage and counts toward the monthly cap. The planner's own
  per-call log (`content_planner_ai_generations`) stays.
- Images are recorded at a per-image price kept in `AiUsageService` beside the token prices (the plan verifies
  the provider's current price for `gpt-image-1` and the `dall-e-3` fallback); today they count as zero.
- `budgetStatus` = `warn` (≥ 80 %): a quiet header notice. `over` (≥ 100 %): every AI action answers 403
  `ai_budget_used_up` before calling the provider ("This month's AI budget is used up — see Settings → AI Usage");
  writing by hand keeps working. Organisations without a cap are never stopped. (The website chat widget already
  refuses when `over`.)
- **One generation at a time per brand**: a calendar generation holds an atomic lock
  `content:generate:{org}:{brand}` for its run (≤ 300 s); a second request answers 409 `already_generating`.
  A strategy generation is refused (409 `already_generating`) while that brand has a strategy in `generating`.

## 6. How it is built

### 6.1 Shared core — `frontend/src/workspace/`

Moved out of `frontend/src/appointments/` (Appointments then imports them from here); anything calendar-, booking-
or money-specific stays in Appointments.

| Shared piece | From | Note |
|---|---|---|
| Atelier tokens, base styles, `@font-face` | `theme/appointments.css` (token + font part) | New `theme/workspace.css`, tokens under `[data-workspace]`; Appointments' component styles stay in `appointments.css` under `[data-appointments]`. Tailwind `a.*` names unchanged. |
| Fonts + OFL licences | `theme/fonts/` | Same files, new place. |
| Accent maths | `theme/accent.ts` | Unchanged API. |
| Look (Light/Dark/Auto, rail size) and last-brand paint | `lib/look.ts` | Storage keys take the workspace name: `appointments:look` stays `appointments:look`; Content uses `content:look`, `content:brand-paint`. |
| Shell mark | `lib/shellMark.ts` | `<html data-shell="content">` for Content. |
| UI pieces | `ui/Button, Field, Notice, Skeleton, Typography, ThemeSwitch, ShortcutsSheet` | ShortcutsSheet takes its rows from the app. |
| Shortcut engine | `lib/shortcuts.ts` | Engine + Cyrillic physical-key fallback; each app passes its own map. |
| Find frame | `find/FindDialog.tsx` | Results come from an app-supplied source. |
| Venue clock + media query | `lib/wallClock.ts`, `lib/useMedia.ts` | Unchanged. |
| Shell frame | from `AppointmentsShell.tsx` | `WorkspaceShell` (rail, top bar, notice area, accent root) filled by each app's nav, title, actions. |
| Way-in helpers | `lib/landing.ts` | Generalised: `showsWorkspaceLink(user, name)`, `loginPathAfterExpiry` for any workspace path, `landingPath` knows both workspaces, `fullAdminPathFor` per workspace. Appointments-only helpers keep their names. |
| Shared words | `i18n/appointments.*.json` (theme, language, full admin, sign out, shortcut sheet, Find frame) | New `workspace/i18n/workspace.{en,ru,de,fr,es}.json` under `workspace.*`. |

The full admin's "mood" typography (`index.css` `[data-mood]` rules) must not apply inside **any** workspace; today
it excludes `data-shell="appointments"` only. A test proves both workspaces are excluded.

### 6.2 HexaTech Content — `frontend/src/content/`

- `ContentApp.tsx` lazily imported by `App.tsx` at `/content/*`, beside `/appointments/*` (own chunk, outside the
  full admin's `Layout`, the full admin's AI copilot hidden there as on `/appointments`). Guard: no session →
  `/login?redirect=…`; a member → `/portal`.
- `ContentProvider` (bootstrap query `['content','bootstrap']`, no retry on 401/403), `ContentShell` (on
  `WorkspaceShell`), pages `plan/`, `posts/`, `strategy/`, `brand/`, `post/` (panel), `find/`.
- `lib/api.ts` with `BASE = '/v1/admin/content'`, a `watched()` wrapper that raises the switched-off notice on
  `workspace_disabled`, and the explicit `brand_id` (§6.7).
- Its own drag layer (pointer events, no library) reusing the pure maths style of Appointments' `dragMath`.
- Words in `content/i18n/content.{en,ru,de,fr,es}.json` under `content.*`, registered when the chunk loads.
- Platform marks: one token per platform for light and dark; the mark's text follows the white-≥ 3:1-else-ink rule
  (TikTok's light cyan gets ink). Status dots use Atelier tokens, not today's raw hex.
- Today's large files are split by section: the 1,432-line wizard becomes the Brand section editors; the
  1,130-line Posts view becomes the panel and the list.

### 6.3 Workspace flag, sign-in, command

- `Organization::WORKSPACE_DEFAULTS = ['appointments' => true, 'content' => true]`.
- `workspace('content')` is off for an organisation on the Appointments plan (`appointmentsOnly()`): that plan holds
  only the appointments workspace (as today, when the access map already refuses it the planner).
- `workspacesPayload()` adds `content: {landing}` for enabled organisations; sign-in (`user.workspaces`) and
  `/v1/auth/me` (`workspaces`) carry it as they do for Appointments. Frontend type in `authStore` widened.
- **One landing per organisation**: `setWorkspace($name, true, landing: true)` clears `landing` on every other
  workspace. `landingPath`: Appointments-only → `/appointments`; else Appointments landing → `/appointments`;
  else Content landing → `/content`; else unchanged.
- `php artisan workspace:content {org?} --on --off --landing --status --list` (same output style as
  `workspace:appointments`, without its plan flags).

### 6.4 API — `/v1/admin/content/*`

Inside the existing admin group (`saas.auth, auth:sanctum, tenant, brand, throttle`, then `admin, admin.access,
check.subscription`) behind `workspace:content`. A test proves every route under the prefix carries the gate.
Controllers in `app/Http/Controllers/Api/V1/Admin/Content/`. **M** = manager only; **AI** = passes the AI gate.

| Method + path | What | |
|---|---|---|
| GET `bootstrap` | name, organization, brand {id,name}, brands [{id,name}] the user may use, accent, venue {timezone, timezone_named, today}, staff {name, role, can_manage}, profile {id, setup_completed, readiness} or null, ai {status, percent} | |
| GET `plan?from&to` (≤ 62 days) | cards in range, unscheduled cards, open slots, the week's four numbers | |
| GET `posts?q&status&platform&pillar_id&from&to&unscheduled&page` | list, 50 per page | |
| GET `find?q` | up to 8 posts | |
| POST `posts` · GET/PUT/DELETE `posts/{id}` | create, read, save (stale check), delete | |
| POST `posts/{id}/move` | `{scheduled_date|null, scheduled_time?, updated_at}`; refused for published posts | |
| POST `posts/{id}/duplicate` · `mark-ready` · `mark-published` | as today | |
| POST `posts/{id}/write` · `rewrite` `{type, guidance?}` · `quality` · `visual-brief` · `image` | single-post AI | AI |
| POST `slots/fill` `{date, platform}` | creates one draft for the slot and writes it | AI |
| POST `generate` `{from, to, platforms?, fill_empty_only, instructions?}` | calendar generation, lock §5.2 | M, AI |
| GET `strategies` · GET `strategies/{id}` | list, read (polled while generating) | |
| POST `strategies` (202) · `strategies/{id}/activate` · `strategies/{id}/archive` | generate, switch, archive | M (generate: AI) |
| GET `brand` | profile, audiences (each with `posts_count`), channels, voice, readiness | |
| PUT `brand/profile` · PUT `brand/voice` | save one section | M |
| POST/PUT/DELETE `brand/audiences[/{id}]` · `brand/channels[/{id}]` | edit in place (§7, F1) | M |
| POST `brand/quick-setup` · POST `brand/setup` (guided finish) · POST `brand/refresh-knowledge` | | M (quick setup: AI) |

Errors are `{error: <code>, message}`; the portal shows its own words per code (§8.1).

### 6.5 Server pieces — `app/Services/Content/`

- `ContentAccess` — the manager rule (`canManage`, `requireManager`), reused by every controller and the bootstrap.
- `ContentAiGate` — budget check before a call (`ai_budget_used_up`), usage recording after it, the generation lock.
  `ContentPlanner\AiClient` and `ImageGenerationService` report their usage through it.
- `ContentSlots` — open slots for a brand and a date range (§6.6).
- `ContentPlan` — the plan answer (cards, unscheduled, slots, four numbers) for a range.
- `ContentBrandEditor` — in-place saves of profile sections, audiences, channels, voice (§7, F1).
- The existing services stay and are called as today: `ContentPlannerStrategyService` (+ `GenerateContentStrategy`
  job), `ContentCalendarGenerationService`, `ContentPostGenerationService`, `ContentQualityService`,
  `ContentVisualBriefService`, `ContentKnowledgeService`, `ProfileBootstrapService`, `ContextBuilder`.

### 6.6 Slots

A slot is (date, platform) for each **active** channel of the brand and each weekday ticked in that channel's
`frequency` (mon…sun). A channel with no ticked day has no slots ("flexible"). A slot is **open** when the date is
today or later on the venue's clock and the brand has no post on that date for that platform other than
`archived`; a `skipped` post fills its slot on purpose. `posts_per_week` is not used for slots in this release.

### 6.7 Brand

- The portal sends one explicit `brand_id` with every request; the existing `brand` middleware validates it
  (tenant and staff brand restrictions) as for every admin route. The portal's choice wins over the full admin's
  `loyalty-brand` value (a test proves it).
- Choice remembered per device (`content:brand`). First visit: the full admin's current brand if one is chosen and
  allowed, else the organisation's default brand. Never "All brands".
- `bootstrap.brands` lists the brands the user may use (their assigned brands when restricted, else every brand of
  the organisation); the switcher shows only when there is more than one. A stored brand no longer allowed falls
  back to the first.
- Switching brand clears the portal's queries and closes the panel (unsaved-edits guard first).

### 6.8 Time

Post dates and times are the venue's wall-clock strings (`scheduled_date`, `scheduled_time`) and are never
converted. "Today", the current week and open slots use the venue's zone (`VenueClock::zone/today`, the same source
as Appointments), sent in the bootstrap; the browser's zone is never used.

### 6.9 Way in, way back, retirements

- Full admin menu: **HexaTech Content** first in the "CRM & Marketing" group (`gate: 'all'`, `workspace:
  'content'`), shown by `showsWorkspaceLink(liveUser, 'content')` from the `/v1/auth/me` refresh.
- The Marketing hub's Content Planner tile becomes a link to `/content`; `/marketing?tab=content-planner` redirects
  to `/content`.
- "Full admin" in the portal opens `/marketing` for managers and the dashboard `/` for staff (the Marketing hub is
  manager-only in the full admin).
- Access map: key `admin/content` → `['staff', 'staff', 'content']`; `content` joins `AccessMap::PRODUCTS` (enforces
  nothing today except that the Appointments plan does not hold it). The old `admin/content-planner` key goes.
- Removed in the same release: the six `ContentPlanner*Controller`s and every `/v1/admin/content-planner/*` route;
  `frontend/src/pages/ContentPlanner.tsx`; `frontend/src/components/ContentPlanner/*` (types and metadata move to
  `content/lib`). Nothing else calls these routes (checked 2026-10-14). Browser tabs left open across the deploy
  must be reloaded (runbook note).
- Help: the Documentation Center entry and the help article point to `/content`; `planFeatures.ts` labels stay.
- Runbook `docs/content-workspace.md` (who has it, switching on/off, roles, AI spend, rules the code keeps,
  deploying), in the style of `docs/appointments-workspace.md`.

## 7. Data and fixes

No new table, no migration: every profile, strategy, post and image carries over as it is. Each fix lands with a
test that fails first.

| # | Fix | Today |
|---|-----|-------|
| F1 | Brand edits update in place: audiences, channels and voice saved by id (update, add, delete only what was removed). Removing an audience used by posts first says how many and leaves those posts without an audience only after the manager confirms. | Every wizard save deletes and re-creates them; posts lose `audience_id` (nullOnDelete). |
| F2 | Every id a request names (profile, pillar, audience, campaign, channel, strategy, post) must belong to this organisation **and** the active brand; else 422. | `exists:` rules accept another organisation's ids. |
| F3 | Saving a post sends the `updated_at` it loaded; a newer one answers 409 `changed_elsewhere` ("Changed by someone else — reload to see their version"). Moves check it too. | Last write wins. |
| F4 | Reading readiness no longer writes; `knowledge_score` is saved when the profile changes or knowledge is refreshed. | `readinessFor()` writes during GET. |
| F5 | Plan, Posts and Find list only the active brand's posts (the profile's). | The list filters by organisation (plus brand scope), not by profile. |
| F6 | The Guided setup draft is kept per brand on the device (`content:setup-draft:{brand}`). | One `cp-wizard-draft-v2` for all brands. |
| F7 | The broken audience/channel endpoints are gone (replaced by `brand/*`). | `current_organization` accessor does not exist; 500 if called. |
| F8 | AI strings are trimmed by characters (`mb_substr`) on every new write path. | Existing rule; kept. |

Left as they are: the campaigns and assets tables, unused columns (`alternative_copy`, `visual_brief_id` on posts,
`max_length`, `example_*_posts`), the outdated build logs at the repo root.

## 8. Words, errors, accessibility

### 8.1 Words

Every word on screen in English, Russian, German, French and Spanish; a test fails when a key is missing in any of
the five (as `appointmentsLocales.test`). The server's refusals are codes (`manager_only`, `ai_budget_used_up`,
`already_generating`, `changed_elsewhere`, `workspace_disabled`, `published_cannot_move`, validation fields); the
portal maps each to its own sentence and never shows an English server message. AI-written posts keep following
the brand's language setting.

### 8.2 When things go wrong

- An AI action fails: a notice on that action, the post unchanged. A partial generation lists filled and unfilled
  days (as today).
- Session expired: `/login?redirect=<same page>` and back.
- Content switched off for the organisation: a calm notice with the way back to the full admin.
- A move or save refused as stale: the notice offers Reload; the card returns to where it was.
- Unsaved edits in the panel: a confirm before closing, switching brand or leaving the page.

### 8.3 Accessibility

Everything by keyboard, including moving a post (Shift+←/→ on a focused card) and the tray; dialogs and the panel hold and return
focus; text never under 12 px; colours meet contrast in light and dark (tests on tokens as in Appointments);
Lighthouse accessibility run on Plan, panel, Brand; no conformance claimed.

## 9. Quality bar and tests

Run by folder, in the foreground, with PHP 8.4.20 (project rules); frontend `npx tsc -b && npx vitest run`.

- **Server** `tests/Feature/Content/`: the gate on every route; the staff/manager table endpoint by endpoint;
  organisation and brand isolation for every id (F2); stale save and stale move (F3); published post cannot move;
  AI refusal at `over` before any provider call, usage recorded with feature `content`, images priced; the
  generation lock and the strategy refusal; brand edits keep post links (F1); readiness read writes nothing (F4);
  plan answer (slots, unscheduled, four numbers) on the venue's clock; sign-in/`me` payload, Appointments-plan
  organisations without Content, one landing; `workspace:content` command; access map key. **Unit**
  `tests/Unit/Content/`: `ContentSlots`, `ContentAiGate`. The existing `tests/Feature/ContentCalendar/` keeps
  testing the generation service, re-pointed at the new route.
- **Frontend** (`src/content/**`, `src/workspace/**`): locale completeness for `content.*` and `workspace.*`;
  a token sweep for Content (only `a-*` classes, only `/v1/admin/content` paths, selectors scoped under
  `[data-content]` / `[data-workspace]`, nothing under 12 px); drag maths; week numbers and slots; way-in helpers
  for both workspaces; the mood-typography exclusion; brand choice beats `loyalty-brand`.
- **Appointments unchanged**: all its PHP and vitest suites green; a before/after screenshot comparison of its
  calendar (day, week, list), panel, clients, setup, takings, insights — light and dark, 1440 and 390 px — shows
  no differing pixels; the build shows `AppointmentsApp-*` and `ContentApp-*` chunks and no `index-*.js`
  containing `data-appointments` or `data-content`.
- **Real browser**: 1440 px and 390 px, light and dark, English and Russian, as a manager and as staff, on local org
  16; one real AI post and one real AI week when a local AI key is available (otherwise the AI calls are faked and
  that is said in the report).

## 10. Rollout

Feature branch `feature/content-workspace`, worktree `../Hexa-Tech-content`, cut from `origin/main` `de20fc3a0`.
Each release gets its own implementation plan, written and approved before its work starts.

1. **Release 1 — shared core (invisible).** `frontend/src/workspace/` exists and Appointments runs on it; no
   change anyone can see. Ships after the Appointments suites, the screenshot comparison and the build check pass.
2. **Release 2 — HexaTech Content.** The portal, the server group, the menu item, the redirect, the retirements,
   the fixes, the runbook.

Both through the source-patch recipe (worktree from `origin/main`, the change list including deletions, tests on
the artifact, fresh build, push, verify by content on the live site: the `ContentApp` chunk carries the portal's
words, the index bundle does not, `/v1/admin/content/bootstrap` answers 401 where it answered 404, the old
`/v1/admin/content-planner/profile` answers 404, Appointments as before). No migration in either. **Each waits for
the owner's "yes, deploy".**

Owner after release 2: open `/content` as a manager and as a staff member; generate one week on a real brand; look
at Settings → AI Usage for the `content` line; reload admin tabs left open across the deploy.

## 11. Risks

| Risk | Answer |
|---|---|
| Moving the shell breaks Appointments. | Release 1 alone, invisible; suites + screenshot comparison + build check before it ships. |
| The admin's mood typography leaks into Content (it did into Appointments). | Exclusion generalised to every workspace, guarded by a test. |
| Long AI requests (calendar up to 240 s) on Laravel Cloud. | Unchanged from today's proven path; the lock stops duplicates. |
| An open old tab calls a removed route. | 404 → reload; noted in the runbook and the owner's after-deploy list. |
| Organisations with a monthly AI cap suddenly hit it once Content spend counts. | Intended (D6); the 80 % notice warns first; writing by hand still works. |
| Staff delete posts managers wanted. | Delete asks first; approvals and roles beyond this are a later part. |
