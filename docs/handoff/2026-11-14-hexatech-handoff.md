# HexaTech handoff — 14 November 2026 (Time Planner: the AI assistant)

Previous state: `2026-11-13-hexatech-handoff.md` (stay promotions and the booking journey, another session) and, for the
Time Planner, `2026-11-09-hexatech-handoff.md` (rounds 1–3). Branch `ccr-e74852c3-mco7tm`. Runbook:
`docs/time-planner-workspace.md`, section "The AI assistant and coach (2026-11-14)".

## The owner's request

"I want to do some improvements in our time planner. So now let's focus on AI assistant, which will help to plan the day
or the week for our employees, which could help analyze the data from the previous weeks and suggest how long each task
could be and who do better and the worst of our employees … the main idea could be some education before AI about our
employees, about the tasks, what they do, about the roles, about the knowledge of them … it could suggest something or
make some strategy, and then they could help to fill the data … as we have also this pool … AI could help to use the
tasks and add to employees regarding the day … any other ideas how to implement the powerful AI day planner." Standing
word: deploy when done.

## What was built

- **Teach the AI** (a manager's): the business, house rules and goals (`planner_ai_context`); per task type a note, a
  typical length and the best time of day (`planner_type_notes`); per task a note and a typical length
  (`planner_task_notes`) — `App\Services\Time\Knowledge`, through `PUT time/settings/{key}`. Per person a job title,
  level, strengths and what they are learning (the planner profile, `PlannerProfiles`). "Draft with AI" fills the form
  from the settings and the history; the manager reads, corrects and saves.
- **Learn from the weeks behind** (`Learning`, reads only): per type and task, planned against real (clocked) length,
  the drift and a suggested length; per person finished, on time, real against planned, and per type on time and
  speed against the team, with strengths and where to support; who leads each type and who could use support.
  Comparing people is a manager's — a staff member sees only their own figures. Every plan now sizes a task without a
  length from the typical length, else the learned one; the task form's estimate puts the chosen person's own history
  first.
- **Plan the week with AI** (`WeekPlanner`, `POST time/plan-week`): the pool, the backlogs and overdue work to days and
  people (skills, knowledge, levels, experience, due days, each day's room), every AI line checked, the rules place the
  rest, then each day is timed. Applied by a person (`time/plan/apply` with dated lines). In the Planner's week view;
  this week or the next.
- **The AI assistant** (`/time/assistant`, `Assistant`, `POST time/assistant`): a conversation; Claude looks things up
  with read-only tools (day, week, pool, people, learning, insights, find) and proposes changes (add, assign, move, set a
  length) that the server checks against the asker's rights; each is applied with a press through the full admin's own
  planner endpoints.
- **The AI coach** (`/time/coach`, `GET time/coach`, `POST time/coach/strategy`, `POST time/coach/draft`): readiness
  (what the AI knows, with the way to each gap), the period's figures, an AI strategy with one-press fixes (a typical
  length, a type added to a person's skills), task lengths planned against real ("Use 40 min"), people by type, and
  Teach the AI.
- New spend kinds `time_week_plan`, `time_assistant`, `time_coach`, `time_draft`, each route its own throttle bucket.
  AccessMap key `admin/time/coach` (read: staff; strategy and drafts: manager). No migration.

## Decisions for the owner

- The comparison of people ("who does better and the worst") is shown to managers only, worded as "who could use
  support", and only with at least three finished tasks behind a figure; a staff member sees their own figures.
- The AI never writes: plans, proposals, fixes and drafts are applied by a person, each through the writer the full
  admin uses.
- The conversation is kept in the browser's session only (nothing stored on the server).

## Checks (this container, 14 November)

- **PHP**: the branch's sweep (34 of the scoped runs before it was stopped for the artifact's) all passed; new
  `tests/Feature/TimeWorkspace` 63 tests (15 new: `KnowledgeLearningTest`, `WeekPlanTest`, `AssistantCoachTest`) on
  SQLite and PostgreSQL 16, `Planner` 59 on PostgreSQL; Larastan no errors. The release artifact's full sweep: below.
- **Frontend**: `tsc -b` clean, lint clean, Vitest 458 files / 6,755 tests on the branch (new: `coach/coach.test.ts`,
  `coach/CoachPage.test.tsx`, week plan logic in `plan/plan.test.ts`); every word in five languages.
- **Real browser** on the Riga demo with a local stand-in for the AI service (`ANTHROPIC_BASE_URL` pointed at a mock
  that answers each tool from the request's facts; no real provider was called): as a manager and as a staff member,
  1440 Dark and 390 Light — the assistant's reply, two proposals applied (both saved), the strategy and its typical-
  length fix (saved), task lengths, people, Teach the AI with the types and people drafts, the week plan (25 lines for
  next week), the profile's new fields. No console error, no failed request. Found and fixed by eye: a screen-reader
  label widening the phone page on Task lengths, the week dialog offering only the weekend on a Saturday (now this week
  or next, the next first late in the week), a staff member's overview tiles showing the team's totals (now their own),
  the week's "not planned" sentence speaking of a day.

## Deploy (14 Nov, 17:38 UTC)

- Production **84cdb581** by the source-patch recipe on `origin/main` **76b6a2c7** (another session's booking release):
  source patch **e828e2a0** — the branch from bc410bd to **3ca87339** plus this handoff, 80 files (31 added, 49
  changed, none deleted). Five files had changed on main too and were merged three-way (`CLAUDE.md`, `AccessMap.php`,
  `routes/api.php`, the 9 Nov handoff, and `frontend/src/time/lib/api.ts`, where main had added `time/pulse`: both
  kept). Per-file parity: the 75 others match the branch byte for byte; every line this round added to the five
  merged files is present. Fresh build **84cdb581**. The artifact had its own `composer install` (main's lock carries a
  Laravel security fix).
- **On the artifact**: the full PHP sweep, 82 scoped runs — **7,796 passed, 25 skipped, 0 failed**; Vitest **483
  files / 7,211 tests** passed; `tsc -b` and lint clean; `npm run build`; the built SPA served by `php artisan serve`
  from the artifact renders `/time`, `/time/plan?view=week`, `/time/assistant` and `/time/coach` with no error.
  (`php -S` with `public/index.php` as the router answers the SPA's assets as HTML — use `artisan serve` for this check.)
- **Live by content** (17:41 UTC): `index-Cw6cqmvO.js` → `TimeApp-BKIzMVDb.js` (the week plan's button) →
  `CoachPage-CIOXgmPP.js` ("Make a strategy"), `AssistantPage-f9CagO2P.js` ("Proposed changes"); `/time`,
  `/time/coach`, `/time/assistant`, `/time/plan`, `/time/register` 200; `api/v1/admin/time/coach` and the other
  session's `time/pulse` 401 without a login; `hexa-academy`'s kit 64,577 bytes, 0 `rp-` markers; the retired
  `ruled_page.css` 404. Production's bundle names differ from the committed build's (Cloud rebuilds it): check by
  content, not by the committed hash.
- CI on main 84cdb581: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/43622167280 — **green** (all
  eight jobs: PHP on SQLite in three shards, PHP on PostgreSQL 18 with only known failures, Larastan, the SPA on Node 24
  and 26, the dependency audit).
- **Next source-patch baseline: 3ca87339** (handoff commits after it are docs only).

## Follow-up the same day (the owner: "is there anything else what need to do, if yes do it")

- The AI assistant is in the phone's top bar (staff plan their own day from their phones); Find has "Plan the week with
  AI" (`/time/plan?view=week&ai=week`).
- Renaming a task type in Settings moves what the AI was taught about it to the new name (checked in the browser: the
  note followed the rename and came back with the old name).
- The Time Planner's sign-up page names the week plan, the assistant and the coach in every package (five languages).
- Worth watching: one assistant answer may take several AI calls, so Lite's allowance (5 € a month) covers fewer
  conversations than the plans and reviews did. The allowance stops the AI before the provider is asked, and the rules
  still plan when it is used up; if Lite customers run out early, raising Lite's `ai_monthly_cost_cents` is billing's
  change (and `PlanModules`' fallback with it).

## What the owner does by hand

Nothing for this round. The AI uses the venue's existing allowance and the server's `ANTHROPIC_API_KEY`, as before.

## Left open

- The full admin's own Planner does not show clocked time; its Stats count planned minutes as before.
- Real lengths need clocked work (3 per type or task); until teams use Start and Finish, the planned length stands in.
- Renaming a task type renames neither tasks, templates nor preferences (as in the full admin); its AI notes do follow
  it (follow-up below).
