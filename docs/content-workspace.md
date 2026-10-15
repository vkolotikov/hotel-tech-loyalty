# HexaTech Content — runbook

HexaTech Content (`/content`) is the AI Content Planner as its own workspace beside the full admin, a sibling of
HexaTech Appointments. Spec: `docs/superpowers/specs/2026-10-14-content-workspace-design.md`. This page covers the
server, the portal, the way in from the full admin and what release 2 retired.

## Who has it, and switching it

- Every organisation has it by default (`Organization::WORKSPACE_DEFAULTS`). Organisations on the Appointments plan
  do not: it is not part of that plan, and the access map refuses them (`not_in_plan`).
- `php artisan workspace:content <org> --on [--landing] | --off | --status`, and `--list` for the organisations that
  differ from the default.
- An organisation lands in one workspace only: `--landing` here takes the landing from Appointments, and the other
  way round.
- Sign-in (`user.workspaces.content`) and `/auth/me` (`workspaces.content`) carry `{landing}` for staff.
- **The way in:** the full admin's menu shows **HexaTech Content** first in "CRM & Marketing" to staff of every
  organisation that has it (`showsWorkspaceLink(user, 'content')`, from the `/v1/auth/me` refresh), and the Marketing
  hub's tile opens `/content`. An old `/marketing?tab=content-planner` link lands on `/content`. An organisation that
  chose Content (`workspace:content <org> --on --landing`) lands there after sign-in when no other page was asked for.
  A sign-in that runs out on a Content page comes back to it.
- **The way back:** "Full admin" in the portal opens `/marketing` for managers and `/` for staff (the Marketing hub is
  manager-only).

## The API

All under `/api/v1/admin/content/`, behind the admin chain, `workspace:content` and `content.brand`.

- `content.brand` pins every call to exactly one brand: the one named in `?brand_id=` when the person may use it,
  otherwise their default brand. `brand_id` is read from the query string only. A restricted member asking for
  another brand gets 403 from the shared `brand` middleware: `error` and `message` keep the sentence every admin
  screen shows, and `code` is `brand_not_allowed`, so the portal can drop a stored brand and ask again without one.
- Refusals are `{error, message}`. The codes are `no_brand`, `no_profile`, `manager_only`, `not_found`,
  `ai_budget_used_up`, `already_generating`, `changed_elsewhere`, `published_cannot_move`, `slot_not_open`,
  `no_channels`, `range_in_past`, `ai_failed`, `audience_in_use`, `already_set_up`, `not_ready` and
  `generation_failed`.
- Generate never writes days already gone on the venue's clock; a range wholly in the past answers `range_in_past`.
  Making a strategy active switches the active pillars to its own; archiving the active one retires them.

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
- **One strategy and one quick setup at a time per brand.** Starting a strategy holds the cache lock
  `content:strategy:{org}:{brand}` for its check and placeholder (10 s); a quick setup holds
  `content:quick-setup:{org}:{brand}` for its AI call (600 s). Like the calendar's lock, these need a cache store every
  server shares (database or redis — not `file` on several servers).
- **AI failures are said in our words.** An `ai_failed` answer never carries the provider's text; it is in the log
  (`report()`).
- **Spend needs a price.** An overridden `CONTENT_PLANNER_AI_MODEL` must be in `AiUsageService::MODEL_PRICING`, or its
  spend is logged at 0.

## The portal (`/content`, `frontend/src/content/`)

- **Where it lives.** A lazily loaded app on the shared workspace core (`src/workspace/`), beside Appointments: own chunk, own shell, no full-admin copilot.
- **Look.** Kept on the device under `content:look` and `content:brand-paint`.
- **Brand.** Every call names its brand in the address (`?brand_id=`), so the full admin's request hook leaves it alone. The device remembers the brand under `content:brand`; on a first visit it takes the full admin's choice, else the person's default. A remembered brand the person may no longer use (the server's `code: brand_not_allowed`) is forgotten, and the default is asked for instead. Switching brand clears every Content query and asks first about unsaved edits.
- **Plan.**
  - Week, month or list. Below 1024 px only the list.
  - Read every 60 s and on focus.
  - The This week strip comes from the server's figures for the shown range.
  - Empty slots offer Write (a new post for that day and platform) and Fill with AI (one post, through the server's one-day generation).
  - The Unscheduled tray. A card is moved by drag (mouse and pen after 4 px; a finger after a still 400 ms) or by Shift+← / → on a focused card. A move saves at once with the version it read, shows on the plan as soon as the server answers (`lib/planCache.ts`, so the next move sends the new version), and an Undo shows for 8 s that puts back the day and the time. A second move of a card whose first is still on its way is not sent. A refused move says why and reads the plan again.
  - Published posts do not move.
  - Generate is for managers only. It covers ≤ 62 days, and days already gone are never written (the server's `range_in_past`).
- **Post panel.**
  - App-level: it stays open across pages.
  - A save sends only what changed, with the `updated_at` it read. A save from a stale copy offers "Load their version".
  - Closing it, opening another post, switching brand, "Full admin", Sign out or leaving the site with unsaved edits asks first. The browser's Back out of the portal cannot ask: the edits are kept in the tab's memory (`panel/kept.ts`, same session and brand only) and come back with a notice when the person returns.
  - AI tools that write into the post wait while it has unsaved edits; a rewrite only offers text to use. Every answer (AI, actions, Save) lands under anything typed while it was on its way: fields the person changed keep their text (`rebase`). The person's own move of the open post takes the new day the same way; another device's change still waits for Save, which then offers their version.
  - A post started from the New post button opens on the brand's first active channel.
  - Post links: `/content/posts/<id>` opens the post's week with the panel.
- **Find** (Ctrl/⌘ K or "/") searches the brand's posts on the server from two letters (up to 8), plus the actions.
- **Posts** (`/content/posts`): every post of the brand, newest scheduled first and those with no day last, 50 a page (`GET posts`). The search and the filters (status, platform, pillar, from–to, only posts with no day) live in the address, so a list can be shared; a value the address holds that cannot be used falls back to none. Archived posts show only when their status is chosen. A post's own link opens here when it has no day.
- **Strategy** (`/content/strategy`): the active strategy as a document, and this month's posts per pillar against the pillars' target weights (the server's `balance`). `?id=` shows a past one. Managers make a new one (a queued job: the list is read every 5 s while one is being made; after 15 minutes the page calls it stuck, when the server also lets a new one start), make a past one active, or archive one. Locally the job needs a queue worker (`php artisan queue:work`), and the local queue may hold other jobs, such as mails, that a worker would also run.
- **Brand** (`/content/brand`):
  - Readiness shows what is missing by code (`readiness.sections[].missing`, from `ContentKnowledgeService::GAPS`); `BrandTest` keeps the portal's words (`content.brand.gap.*`) and the codes equal. Refresh knowledge re-reads the organisation's FAQ, chatbot and services.
  - Sections — Brand DNA, Audiences, Voice, Positioning, Channels, Rhythm and goals — are read by everyone and edited by managers one at a time. Each section reads any stored shape, edits its own draft and saves only its own fields that changed; parts it does not show go back as they came. `name`, `default_language` and `trend_mode` are never sent empty (the server refuses null there).
  - Audiences and channels keep their ids. Removing an audience that posts use asks first with their number (`?confirm=1`); any channel change reads the Plan again, so its slots follow.
  - A brand with no profile: managers choose Quick setup (one AI call, minutes; the AI's assumptions are shown) or Guided setup (the sections in turn; each step saves as it goes; the device keeps the step reached under `content:setup-draft:{brand}`; Finish sends `POST brand/setup`). Staff are told their manager has not set it up yet.
- **Option lists** (tones, roles, mix categories, …) live in `content/lib/options.ts`, moved from the old planner; stored values are kept as they are and named under `content.options.*`.
- **Shortcuts:**
  - N new post, T this week, ← → back and forward, W M L views, ? the list.
  - The Cyrillic layouts reach the same keys by their places.
- **Words.**
  - Five languages in `src/content/i18n/content.{en,ru,de,fr,es}.json`, under `content.*`. `contentLocales.test.ts` keeps the key sets equal and the `{{names}}` intact.
  - Every refusal is shown in the portal's own words (`lib/errors.ts`).
- **Colours.** `theme/content.css`, under `[data-content]`. Each platform's fill takes white ink while white reads 3:1 on it, else dark ink. Each status's tone reads 4.5:1 over its own tint (`contentCss.test.ts`).

## What this release does not do

No approvals, no publishing to social networks, no campaigns or media-library screens, no plan limits, and no AI
model allowlist for Content. The old AI Content Planner is gone: its `/v1/admin/content-planner/*` routes answer 404
and its screens are removed; a browser tab left open across the deploy must be reloaded.

## Deploying

- No migration: every profile, strategy, post and image carries over as it is.
- Ship by the source-patch recipe (`docs/landing-page-builder.md` §6): a worktree from `origin/main`, the change list
  since the last deployed feature tip with every deletion, the suites on the artifact, a fresh build, then push. Never
  push the feature branch.
- Verify by content on the live site: the `ContentApp` chunk carries the portal's words and the index bundle does not;
  `/api/v1/admin/content/bootstrap` answers 401 when signed out (404 before release 2);
  `/api/v1/admin/content-planner/profile` answers 404; the Appointments chunk is as before.
- After the deploy (owner): open `/content` as a manager and as a staff member; generate one week on a real brand;
  check Settings → AI Usage for the `content` line; reload admin tabs left open across the deploy.
