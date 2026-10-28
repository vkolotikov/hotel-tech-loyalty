# Handoff — HexaTech, 2026-10-27

The state of the app, how to work on it and what is open, for a new session on another device or with another AI
agent. Production is `main` **0f59ddab1** (2026-10-27, HexaTech Loyalty Members and Program). Update this file, or write the
next dated one beside it, at the end of every session.

## Latest deployment — Members and Program, 27 October

The six completed Figma frames in `d6IGmk3hOoMw0V5rONbI1A` are implemented: Members, member profile, Award points
(`59:3276–3278`), Levels, Edit level and Add benefit (`72:3598–3600`). Existing `/loyalty`, member/profile and
`/loyalty/program` routes remain, as do import/export, membership management, points writers, NFC, all Program
sections and permissions. Layouts were compared against the exact Figma exports and checked at 1440, 1024, 390
and 320 pixels; all five locales and theme switching remain supported.

Work continues on **`feature/loyalty-members-program-20261027`**. The deployed feature source is **2d6e03d81**,
applied onto **4c13e2d1f** as **9bead854f**, then freshly built and pushed as **0f59ddab1**. All 81 explicit paths
matched the feature source. The next source change list starts at **2d6e03d81**; older baselines below are historical.
No migration, dependency, financial writer or authorization change was introduced.

On the deployment artifact: **75 scoped PHP runs, 7,071 passed / 7 existing skips**, **385 frontend files / 5,553
tests passed**, TypeScript/lint/build passed and **50 compiled-asset browser assertions passed**. This PHP sweep
includes the existing 18-test `tests/Feature/Concerns/` suite omitted from the previous 74-scope loop, plus two new
Members tests. Browser writes used local intercepted fixtures; real controllers/services/database integration was
checked separately in Laravel. No production member transactions were performed.

Cloud's new bundle, stylesheet and three font payloads were verified at **21:51 Europe/Riga**. API authentication
and the landing kit/retired-file checks passed. Live entry: `index-CL4idIXW.js`; Loyalty chunks:
`LoyaltyApp-CjlMH1Wr.js` / `LoyaltyApp-C6Vz3vTm.css`.

Details, exact frames, intentional design adaptations, screenshots and machine-readable evidence are in
`docs/loyalty-redesign/11-MEMBERS-PROGRAM-REPORT.md`. Member list `per_page=10|25|50` is bounded, and history's
optional `type` filter is whitelisted before pagination. Benefit scope and fulfillment metadata are read from the
existing records. Benefit assignments save separately and preserve unsaved edits to the level itself.

The previous Overview milestone remains live at `/loyalty/overview` (source **5706903b1**, production **4c13e2d1f**;
report `docs/loyalty-redesign/10-IMPLEMENTATION-REPORT.md`). Its API remains read-only; mode comes from actual
configuration and current points retain Insights' balance semantics. Shared advice may still warn about points in
a non-points configuration; do not silently change that business contract. The Windows-only helper collision is
already resolved as `payReturnState.ts`.

## The first message for a new session

Paste everything between the two lines as the first message of a new dialogue opened in a clone of
`vkolotikov/hotel-tech-loyalty`.

---

You are picking up HexaTech (multi-tenant Laravel 13 + React SaaS; production deploys from `main` on Laravel Cloud)
from earlier sessions. Before doing anything, read in this order and confirm in one paragraph what you understood:

1. `CLAUDE.md` — the environment, git, deploy and code rules. Every rule comes from a real failure; none is optional.
2. `docs/handoff/2026-10-27-hexatech-handoff.md` — what is live, how to set up, test and deploy, and what is open.
3. The runbook of the area you are asked to touch: `docs/loyalty-workspace.md` (HexaTech Loyalty, `/loyalty`),
   `docs/member-portal.md` (the member portal and booking money), `docs/appointments-workspace.md`,
   `docs/content-workspace.md`, `docs/landing-page-builder.md` (which also holds the deploy recipe, §6).

Then check the environment works (the baselines are in the handoff, "Tests") and report the numbers before changing
anything. The owner's standing word is to deploy every finished, verified job without asking (the recipe's checks
still decide) and then report what went out. Ask the owner only for decisions that are theirs.

---

## What the app is

One Laravel 13 API and one React (Vite, TypeScript) single-page app, many organisations (tenants), four sub-brands
over the same records:

| Product | Where | Code | Runbook |
|---|---|---|---|
| Full admin (the original admin: CRM, bookings, settings, loyalty screens) | `app.hexa-tech.uk/` | `frontend/src/pages`, `app/Http/Controllers/Api/V1/Admin` | — |
| HexaTech Loyalty workspace | `/loyalty` | `frontend/src/loyalty`, `app/Services/Loyalty`, `…/Admin/Loyalty` | `docs/loyalty-workspace.md` |
| HexaTech Content workspace | `/content` | `frontend/src/content` | `docs/content-workspace.md` |
| HexaTech Appointments workspace | `/appointments` | `frontend/src/appointments` | `docs/appointments-workspace.md` |
| Member portal (members book, pay, cancel, see points) | `/portal` | `frontend/src/portal`, `app/Services/Portal` | `docs/member-portal.md` |
| Public booking widget (stays and services) | `/api/v1/booking/*`, `/api/v1/services/*` | `app/Services/BookingEngineService.php` | `docs/member-portal.md` — must not change without the owner |
| Landing-page builder | `sites.hexa-tech.uk` | `app/Landing`, `resources/views/landing` | `docs/landing-page-builder.md` |
| Mobile app's member API | `/api/v1/member/*` | `app/Http/Controllers/Api/V1/Member` | keeps its shapes |

The workspaces share their frame (`frontend/src/workspace/`: dialog, buttons, page header, theme). Each workspace is
switched per organisation with `php artisan workspace:loyalty|content|appointments <organisation id> --on|--off|--status`.
Every staff endpoint is gated by `App\Support\AdminAccess\AccessMap`. Specs of each release are in
`docs/superpowers/specs/`.

## What is live (production `main`)

HexaTech Loyalty was built in this sequence of sessions (2026-10-21 → 2026-10-26), each release deployed by the recipe
and recorded in `docs/loyalty-workspace.md` "Deploying":

| Release | `main` | What it brought |
|---|---|---|
| 1–2 | 0f83ab3 … 7549f28 | The workspace: members, points, requests, scan, program, rewards; members complete, insights, segments, campaigns, card & app |
| 3–4 | f88a90a … 097432a | Push inbox, email safety and tags, logo; portal features, widget money (R4-2, R4-3), portal payments, combination stays, SMS |
| 5–6b | d41a52c … 65b3415 | Scan with tolerant codes, camera and NFC; failed widget bookings leave an enquiry; refunds, disputes, PostgreSQL test fixes; every-brand campaigns and offers |
| 7 | ffabebf | Ways to earn: options, wizard, stamps, check-in, cashback credit |
| 8 | 3ffe5c5 | Membership for every industry: places and access, valid-until, events with sign-up, tiers by visits or spend |
| 9, 9b | 34162f4, d775898 | Review fixes, redesign, the nightly tier check, each venue's own hour |
| Guide, portal Help | 3679c27, acced03 | Documentation inside the workspace; members' FAQ in the portal |
| Ways to earn | d827fcb, a6c06e8, d905343 | Design pass; tabs, checks and industry recommendations; Overview with one-press fixes and the member's journey |
| 10a, 10b | d5b3ccb, e3c7f0b | The owner's Figma look (palette, section cards, Get started panels, figure tiles); Start here checklist, Program's checks, the tier form's member preview |
| 11 | b2cecde | Rename and delete tiers and benefits (soft delete, previewed; members moved; nothing widened) |
| Overview | 4c13e2d1f | Final Overview design, responsive details, independent scoped data, exact request links; existing routes preserved |
| Members and Program | 0f59ddab1 | Six final Figma screens, responsive profiles and forms, bounded directory pagination and filtered member history |

Content's releases (up to 7a) went out before, on 2026-10-20/21. The owner's design source for the loyalty look is
their Figma file `5MtOVFZKvXk5x0mJ8Trm6g` (page `Prototype`, node `1:4`; drafts 163:88 tiers, 163:166 edit tier,
163:244 benefits, 163:322 places, 163:400 boosts, 171:401 section navigation, 131:* program, rewards, members).

## Branches

- **`feature/loyalty-members-program-20261027`** (GitHub) — current working branch. Deployed source tip **2d6e03d81**;
  post-deployment records are committed afterward on this branch. Never push it directly to `main`.
- **`feature/loyalty-overview-20261027`** (GitHub) — previous working branch through the Overview milestone.
- **`ccr-9a004154-cs7txb`** (GitHub) — the prior working branch through release 11, before the Overview milestone.
- **`main`** — production. Deploys are source patches (see "Deploying"), so commit history differs from the
  branch's: compare by content, never by `git log origin/main..branch`.
- **`feature/landing-phase-3c`** — on the owner's Windows workstation only (not on GitHub): unshipped email
  deliverability and staff-capability work (`docs/landing-page-builder.md` §8). Never let it ride another deploy.
- The **next change list** is built from the last deployed branch tip: see the newest record in
  `docs/loyalty-workspace.md` "Deploying" (`git diff --name-status <that tip> <new tip>`).

## The owner's standing instructions

- 2026-10-26: "Yes please, deploy always after job done, no need to ask each time" (in `CLAUDE.md`). The recipe's
  checks still stop a deploy: a failing test, a parity difference or a failed content check.
- 2026-10-26, the Figma request: make it easy "where users could go inside the app without any knowledge and they
  could manage and easy use all the tools and understand all the configuration"; sections contrasting, with colours.
  Release 10 and 11 answer it; new screens follow the same frame (`CLAUDE.md` "Release 10").
- 2026-10-26: "an option for users delete or rename tiers and benefits, so they can customize system for their
  needs" — release 11.
- Earlier, standing: the full admin's loyalty screens stay as they are (2026-10-21); the public booking widget must
  not change without asking (2026-09-29); every string in English, Russian, German, French and Spanish (Spanish
  addresses staff as *usted*); the server decides everything that matters (rights, money, checks, previews), the
  screens only place and word it.

## Setting up

**The owner's Windows workstation** — follow `CLAUDE.md` "Environment" exactly (the pinned PHP path, Git Bash, no
bare `php artisan test`, robocopy rather than junctions for `vendor`).

**A Linux container (Claude Code on the web, or any Linux box)** — what the 2026-10 sessions used:

- PHP 8.4 as `php8.4` (it stands in for the pinned PHP of `CLAUDE.md`), Composer, Node 22, PostgreSQL 16.
- `composer install`; `cd frontend && npm install`.
- PostgreSQL: start the server, create a role and two databases — a development one (e.g. `hexa_local`) and a test
  one whose name contains `test` (e.g. `hexa_test`; `scripts/test-pg.sh` refuses any other) — and run
  `php8.4 artisan migrate` against each.
- Keep the database settings in an env file **outside the repository** and `source` it before artisan commands:
  `DB_CONNECTION=pgsql`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, plus for local work
  `APP_ENV=local`, `MAIL_MAILER=log`, `LOG_LEVEL=debug`, `MEDIA_DISK=public`, `QUEUE_CONNECTION=sync`. Never commit
  credentials and never point local work at production's database or bucket.
- Run the app: `php8.4 artisan serve --host=127.0.0.1 --port=8000` (with `CORS_ALLOWED_ORIGINS=http://localhost:5173`)
  and `cd frontend && VITE_API_URL=http://127.0.0.1:8000/api npx vite --port 5173`. Open
  `http://localhost:5173/loyalty` signed in as a staff user of a local organisation.
- Screenshots: Playwright with the preinstalled Chromium, at 1440 px and 390 px, dark and light, and one other
  language, before claiming a screen is done (`CLAUDE.md`: eyes first, tests second).

## Tests

Baselines at `main` **0f59ddab1** (a different number afterwards is a change to explain):

- **PHP on SQLite** — 7071 passed, 7 skipped, 0 failed, run **directory by directory** (never a bare
  `php artisan test`):

  ```bash
  for t in tests/Feature/*/ tests/Unit/*/ tests/Feature/*.php tests/Unit/*.php; do
    php8.4 artisan test "${t%/}" || exit 1
  done
  ```

- **Frontend** — `cd frontend && npx tsc -b && npx eslint src/loyalty && npx vitest run`: 385 files, 5553 tests, all
  passing.
- **PostgreSQL** — `scripts/test-pg.sh <test database> [paths…]` with the database settings exported (and
  `APP_ENV=testing CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync MAIL_MAILER=array`). Migrate the test
  database first after pulling a new migration. The tests that fail there on purpose are listed in
  `docs/loyalty-workspace.md` "Tests on PostgreSQL" (test data production's schema refuses, and 17 landing render
  tests waiting on the owner's "no price" decision); any other failure is new. Anything that touches the schema, a
  NOT NULL column or a unique index is checked here too: the SQLite test schemas (`tests/Concerns/*`) miss them.

## Deploying (merging to `main` IS a production deploy)

The source-patch recipe of `docs/landing-page-builder.md` §6, as run on Linux in the last sessions:

1. `git fetch origin main`; `git worktree add -b deploy/<name> ../hotel-tech-loyalty-deploy origin/main`; in it,
   `cp -al ../hotel-tech-loyalty/vendor vendor`, the same for `frontend/node_modules`, and copy `.env`.
2. The change list: `git diff --name-status --no-renames <last deployed tip> <new tip>`. Apply A/M with
   `git checkout <new tip> -- <files>` and D with `git rm`. Check that `main`'s source still equals the last
   deployed tip first (`git diff --stat <last tip> origin/main -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell/index.html'`
   is empty), so nothing else is overwritten.
3. Parity: every listed file equals the tip (`cmp`), and the whole tree's source equals the tip.
4. Tests on that tree: the whole PHP loop above, then `cd frontend && npx tsc -b && npx vitest run && npm run build`.
5. `git add -A`; commit with a message that names the change list, the counts and the test numbers, ending with the
   attribution lines; `git push origin deploy/<name>:main` (retry a GitHub 500 with backoff).
6. Verify by content: each listed file on `origin/main` equals the tip (`git rev-parse origin/main:<file>`), new
   classes are in the source, new words are in `public/spa/assets`.
7. `git worktree remove --force ../hotel-tech-loyalty-deploy`; `git branch -D deploy/<name>`; add a record to
   `docs/loyalty-workspace.md` "Deploying" (the `main` commit, the tip, the counts, the next base); commit and push
   the working branch.

Laravel Cloud runs `migrate --force` and rebuilds the SPA on every push to `main`. A migration must be safe on a live
database (nullable or defaulted columns; index swaps in one transaction), and is tried on PostgreSQL first: up, down,
up.

## Working rules that bit in these sessions

- Every string goes through `t('loyalty.…')` (or the area's own prefix) with the English as fallback, and into all
  five bundles with the same keys (`frontend/src/loyalty/i18n/<area>.<lang>.json`); the locale tests compare the
  English with `words.ts` and `errors.ts` and check the placeholders. Spanish says *usted*.
- The workspace has `<base href="/">`: no `#…` links (they leave the app); scroll with a button.
- A component file exports only components (the React refresh lint rule); keys and helpers live in `.ts` files.
  Decisions the screens make live in pure functions, because the frontend tests render to a string.
- New `/v1/admin` routes need an `AccessMap` key (a parent key covers its sub-paths); `AdminAccess` tests fail
  otherwise.
- Colour only through the families (`data-hue`, `.l-hue-*`); a new family needs its line in
  `loyaltyContrast.test.ts`.
- Since release 11 tiers and benefits are soft-deleted: `withoutGlobalScopes()` would see deleted ones — drop only
  `TenantScope`; a test schema that creates `loyalty_tiers` or `benefit_definitions` needs `softDeletes()`.
- Test data gives production's NOT NULL columns (e.g. a guest's `full_name`, a member's `qr_code_token`).
- The Guide's FAQ answers stay under 160 characters and its questions end with "?" (`guide.test.tsx`).
- The owner's Figma assets cannot be downloaded through the container's proxy (403); take screenshots of the nodes
  instead.

## Open items

- **The owner's check of release 11 in production**: on Program → Tiers open Delete on a tier, read the list, press
  Keep it; rename a benefit and back (`docs/loyalty-workspace.md` "After the release 11 deploy").
- **Spanish register**: older strings in the Events, Credit and door bundles (`frontend/src/loyalty/i18n/
  events|credit|door.es.json`) still address staff as *tú*; move them to *usted* (a suggested task was left for it).
- **Full admin and deleted tiers**: its forms (`exists:loyalty_tiers`) still accept a deleted tier's id from a page
  opened before the delete; the nightly tier review moves such a member on. Fix only if the owner wants the full
  admin touched.
- **Landing pages and "no price"**: a priceless service shows €0 / 60 min; how "no price" is stored and shown is
  the owner's decision (17 PostgreSQL landing tests wait on it).
- **`feature/landing-phase-3c`**: the unshipped email deliverability work needs its own review and deploy
  (`docs/landing-page-builder.md` §8).
- Each runbook's "Known limits" section lists the accepted limits of its area.
