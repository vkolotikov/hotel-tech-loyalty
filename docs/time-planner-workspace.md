# HexaTech Time Planner — runbook

HexaTech Time Planner (`/time`) is the full admin's staff Planner (the "Time Management Platform") as its own
workspace beside the full admin, with AI on top: the AI plans a person's or the whole team's day from each person's
skills, knowledge, preferred work, shown experience, hours and capacity; reviews a day or a period; turns typed or
spoken notes into tasks; and the team's real time is clocked per task. The owner (2026-11-09): "We do before portals
for loyalty, crm and AI chat widget, booking and content planner. Now lets make a separate portal for time planner. Use
all data which we have before, style, settings, features etc., build a powerful AI powered … planner, additional
features AI plan and analyse employees day depends on employees knowledge etc., ai capture data, ai voice inputs in
planner and any other improvements to make it more effective."

It is a new shell over the same records as the full admin's Planner: `planner_tasks`, `planner_subtasks`,
`planner_templates`, `planner_day_notes`, the planner's `crm_settings` rows and the staff rows. Nothing is copied or
synchronised; a task moved in one is moved in the other.

## Who has it, and the ways in

- **Sold on its own** (owner 2026-11-09: "make it a module sold separately like CRM and also included in the enterprise
  plan"): the `time` module, billing product `time_planner`, in Lite, Standard and Pro at CRM's prices (49 / 85 / 149 €
  a month, 15 % less paid yearly), alone or with any one other module; its own sign-up `/time/register` and sign-in
  `/time/login`; Plan & products adds, changes or removes it. Every package carries `time_management` and they differ
  by team (`max_team_members` 3 / 10 / 25) and the month's AI allowance (5 / 15 / 40 USD). Packages, prices and the
  billing patch: `docs/plan-modules.md`. An organisation that bought it reaches `account` and `time` only (AccessMap
  product `time`: `admin/time*` and the staff Planner's own `admin/planner*`), lands on `/time` and has no full admin.
- **Every full customer has it** by default (`Organization::WORKSPACE_DEFAULTS['time']`); signing in still opens the
  full admin. An organisation on other modules (HexaTech Loyalty, Content, Appointments, CRM bought on their own) does
  not have it until it adds the Time Planner.
- **The plan decides as in the full admin**: everything but the bootstrap carries `feature:time_management`
  (the Enterprise plan's, and every Time Planner package's). Without it the bootstrap answers
  `features.time_management: false` and the workspace says the Time Planner is part of the Enterprise plan, with a way
  back.
- The full admin's menu shows **HexaTech Time Planner** in "Operations" beside Planner to everyone whose organisation has
  the workspace (`showsWorkspaceLink(user, 'time')`), locked like the Planner without `time_management`. "Full admin"
  in the workspace opens the full admin's Planner (`/planner`).
- **Switching** (an operator, in the application's environment):

  | To | Run |
  |---|---|
  | See the setting | `php artisan workspace:time <organisation id> --status` |
  | Switch it off for one organisation | `php artisan workspace:time <organisation id> --off` |
  | Switch it on, staff landing there after sign-in | `php artisan workspace:time <organisation id> --on --landing` |
  | List the organisations that differ from the default | `php artisan workspace:time --list` |

  Off deletes nothing: `admin/time/*` answers 403 `workspace_disabled` and `/time` says so with a way back; the full
  admin's Planner stays as it is. An organisation that bought the Time Planner cannot be switched off (it is its plan),
  and one on other modules cannot be switched on (it is not in its plan): the command says so.

## Who plans whose day (the planning mode)

The owner (2026-11-09): "for some companies all team can add to others, in some companies only each user can plan their
day, lets make 2 options which can be configured in settings of planner". One setting of the organisation,
`crm_settings.planner_planning_mode`, chosen by a manager in Settings → Who plans (`PUT time/settings/planner_planning_mode`,
audited `planner.planning_mode`):

| Mode | A staff member may | A manager |
|---|---|---|
| `team` (the default, the planner as it always was) | add a task to anyone's day, assign, move, clock and finish anyone's work, plan a colleague's or the team's day with the AI or the rules | the same |
| `own` | add, change, move, clock, finish and delete only their own tasks and the unassigned ones (the pool, the day's work nobody has; taking one is a claim, with the skills rule as before), give work only to themselves or nobody, plan only their own day | plans for anyone |

The rule is the server's, in one place (`App\Services\Time\PlanningMode`), asked by the full admin's own planner
endpoints (`PlannerController`: create, update, move, copy, complete, status, bulk, subtasks, delete — a series only the
occurrences one may change — and the full admin's auto-plan apply, which skips a colleague's task) and the workspace's
(`time/plan` scope, `plan/apply` `not_yours`, a task's clock, the review's actions, the capture, which leaves a named
colleague as a name only). A refusal is 403 `own_day_only` with a sentence the full admin shows as it is. Everyone still
sees the whole team's days. The bootstrap answers `settings.planning_mode` and, for this person, `staff.can.plan_team`;
the workspace hides what would be refused (`time/lib/rights.ts`): a colleague's task opens read-only (it can still be
copied to one's own day), the people lists are oneself, a drag onto a colleague's lane says why it cannot.

## How it reaches the server

The workspace's own endpoints live under `/api/v1/admin/time/`, behind the admin chain and `workspace:time`, all but
`bootstrap` also behind `feature:time_management`. AccessMap (product `time`, as `admin/planner*` since 2026-11-09):
`admin/time` staff / staff, `admin/time/people/{user}` staff / manager, `admin/time/settings` staff / manager.

| Endpoint | What | Who |
|---|---|---|
| `GET bootstrap` | organisation, venue zone and today, the plan's `time_management`, voice set up, the AI's state (`ready`, `not_configured`, `over`, `model_not_allowed`) and the month's allowance, the person and their rights (`TimeAccess::forBootstrap`), the planner's lists normalised (`PlannerCatalogue`: types, tasks, the day's window, the standard day), my counts | staff |
| `GET today` | My day: my board, what is next (running, else the next timed, else untimed), my signals (a manager also `unassigned`), my bucket and the pool my skills allow, this week, the day's note | staff |
| `GET day?date=&person=` | one day person by person (`DayBoard`): lanes, capacity, load, unassigned work, pool counts, signals, the note | staff |
| `GET week?start=&person=` | seven days, a cell per person per day with its tasks and load | staff |
| `GET backlog?scope=mine|pool|team` | the full admin's own `planner/backlog` decides the rows (the pool as the person's skills allow; `team` is a manager's), answered in the workspace's task shape | staff (team: manager) |
| `GET people` | the team (`Team`): profile, skills, preferred work, shown experience (`Experience`, 90 days), today's load | staff |
| `PUT people/{user}` | a person's planner profile: knowledge, hours, work days, break (`PlannerProfiles`) | manager |
| `GET insights?from=&to=&person=` | the period (`TimeInsights`, at most 92 days) and the one before | staff |
| `GET estimate?title=&task_group=&task_category=` | how long such a task usually takes: the median of finished ones, at least three | staff |
| `GET settings` | the planner's settings (the full admin's `crm_settings` rows, only the planner's keys: the day's hours, the standard day, types, tasks, preferences, the planning mode) | staff |
| `PUT settings/{key}` | one of them, in the full admin's shapes (lists as JSON text, the day's hours as `{start, end}`, the mode `team` or `own`); `employees` and every other key are not written here (404) | manager |
| `POST tasks/{id}/start|pause|finish` | the task's clock (`TaskClock`; in `own` mode only one's own or nobody's) | staff |
| `POST plan` | a day's plan: `scope` `me` (anyone), `person` or `team` (anyone in `team` mode, a manager in `own` mode); `include_pool`, `include_overdue`, `include_timed`, `use_ai`, `instruction`, `lang`. AI first when it can be asked, the rules otherwise (`source`, `ai_status`). Writes nothing. 20 a minute (`time-plan`) | staff |
| `POST plan/apply` | writes the lines a person kept (`PlanApplier`) | staff (others' days: the planning mode) |
| `POST review` | the AI's read of a `day` or a `period`, with checked actions. 20 a minute (`time-review`) | staff |
| `POST capture` | tasks from text or a voice note's text, matched to the team (writes nothing). 20 a minute (`time-capture`) | staff |
| `POST transcribe` | a voice note's text (`SpeechToText`, the inbox's own rule). 30 a minute (`time-voice`) | staff |

Everything else is the **full admin's own endpoints**, under their own rules: `planner/tasks*`, `planner/subtasks*`,
`planner/backlog`, `planner/tasks/{id}/claim|release`, `planner/templates*`, `planner/day-note`, `team/{id}` (a person's
skills, a manager's). The planner's settings go through the workspace's own `time/settings` (the same rows), so an
organisation that bought only the Time Planner never needs the CRM's settings area. The frontend may call only the areas
listed in `frontend/src/time/lib/api.ts` (`AREAS`: `time`, `planner`, `team`), always with `brand_id=all`;
`time/tokens.test.ts` refuses any other path.

## The data the planner plans from

- **Skills** (`staff.planner_skills`, the full admin's): the task types a person may take from the pool; NULL = any,
  managers always any. Written only by the full admin's `PUT team/{id}` (the workspace's Team page calls it).
- **Planner profile** (`staff.planner_profile`, new, one writer `PlannerProfiles`): `knowledge` (what they know, in a
  manager's words — the AI reads it), `work_start` / `work_end`, `work_days` (1 = Monday … 7 = Sunday), `break_minutes`;
  since 2026-11-14 also what the AI is taught about the person: `job_title` (80), `level` (`trainee`, `junior`,
  `experienced`, `senior`, `lead`), `strengths` and `develop` (600 each).
- **What the AI is taught** (2026-11-14, `Knowledge`, `crm_settings` rows written only through `PUT time/settings/{key}`,
  a manager's): `planner_ai_context` `{about, rules, goals}` (the business, its house rules, its goals);
  `planner_type_notes` per task type `{notes, typical_minutes, best_time}`; `planner_task_notes` per task key
  `{notes, typical_minutes}`. Saved cleaned (`Knowledge::clean*`: 5–720 minutes, best times `morning`, `midday`,
  `afternoon`, `evening`, `any`, empty entries dropped) and answered as objects.
- **What the planner learned** (2026-11-14, `Learning`, reads only): over the last 8 weeks (4, 12 or 26 on asking),
  per task type and per task the planned and the real median (real only with at least 3 clocked), the drift, the
  suggested length and the typical one written down, with advice (`few`, `longer`, `shorter`, `set_typical`, `ok`); per
  person finished, on time, completion, real against planned, and per type on time and speed against the team (the
  team's median real time over theirs), with `strengths` and `support`; per type who leads and who could use support.
  Comparing people is a manager's: a staff member is answered only their own row.
- **A task's length when it has none** (`Learning::size`): the manager's typical length (task, then type), else the
  learned suggestion, else 60 minutes. Every plan (day, week, assistant) sizes its candidates this way, and
  `time/estimate` answers the person's own finished work first (`basis: person`), then the typical length
  (`basis: typical`), then the team's.
- **Preferred work** (`crm_settings.planner_employee_prefs`, the full admin's "Employee skills", by name): types and
  tasks that fit a person's knowledge best — a soft preference.
- **Shown experience** (`Experience`): from the last 90 days of finished tasks, per type: how many, how many on time,
  how long they took (clocked time where there is some).
- **Hours**: the venue's day is `crm_settings.business_hours_profile` `{start, end}` (only an object is read; the
  workspace's Settings now writes it), else 09:00–18:00 (`WorkWindow`, which the full admin's auto-plan, free slots and
  staff suggestions read too). A person's capacity is their own hours less their break, else the venue's window less
  their break capped at the standard day (`planner_work_hours_per_day`, 8 when unset); 0 on a day off, and 0 for
  a name without an account (its hours are unknown, so it shows planned time without a load).
- **Clocked time** (`planner_tasks.started_at`, `actual_minutes`, new): Start, Pause, Finish; a task finished on any
  screen stops its clock (the model's saving hook); one run counts at most 12 hours; a copy starts untimed.

## How a day is planned

`DayPlanner` (the rules) and the AI (`PlannerAi::planDay`, Claude through one tool) plan the same candidates: the open
tasks of the day in scope (untimed, or all with `include_timed`), the day's unassigned work for a team plan, and when
asked the scope's overdue work (30 days) and the pool tasks their skills allow.

- The rules: high priority first, then the oldest due, then the longest. A task with an owner stays theirs; one without
  goes to who suits it best among those with an account who work that day and may take its type — preferred work, shown
  experience, free room, not a manager while someone else can; someone with room in their capacity first. Each task takes
  the earliest gap in its person's hours after what is timed, their break (around midday) and, today, now.
- The AI's lines are checked one by one against the same facts (a task in scope, a person in scope with an account who
  may take it, a start inside their hours, after now, clear of everything): a clash moves to the person's next free
  gap; anything else goes back to the rules. A name without an account (an outside cleaner) is never handed work.
- When the AI cannot be asked (`not_configured`, `over`, `model_not_allowed`) or fails, the rules plan and the answer
  says so. Nothing is written until `plan/apply`, which skips — never forces — a line whose task changed since
  (`seen`), is done, is someone else's for a person who plans only their own day, or is past the person's skills.

## The AI, and what it costs

- Every AI call is Claude (`services.anthropic.model`) answering through one tool, so the reply is data the server
  checks. The month's AI allowance and the plan's model list are asked before the provider (`PlannerAi::status`); spend
  is recorded in `ai_usage_logs` as `time_plan`, `time_review`, `time_capture` and, since 2026-11-14,
  `time_week_plan`, `time_assistant` (each round), `time_coach`, `time_draft`. A provider failure is logged with its
  text and answered as `ai_failed` in our words; the review and the capture refuse with `ai_budget_used_up`,
  `model_not_allowed`, `ai_unavailable`.
- The AI never writes: a plan is applied by a person, a capture's tasks are saved by a person (each checked first),
  a review's suggestions carry an action only when it names this day's task and a person on the team.
- Voice: `time/transcribe` is the inbox's own transcription (`gpt-4o-transcribe`, then `whisper-1`; no key = 503
  `transcription_unavailable`). The words go into a field or the AI capture for the person to read; a recording is
  never saved. At most two minutes a note.

## The AI assistant and coach (2026-11-14)

The owner: "an AI assistant which will help to plan the day or the week for our employees, analyse the data from the
previous weeks, suggest how long each task could be and who does better and worse … some education before AI about our
employees, the tasks, the roles, their knowledge … it could suggest a strategy and help fill the data … use the pool
and add tasks to employees by day". Four pieces, all behind the same gates as the rest of `admin/time/*`:

- **Plan the week** (`POST time/plan-week`, `WeekPlanner`, throttle 10/min): `scope` `me` or `team` (team only for who
  may plan for others, `PlanningMode`), `start` (any day of the week; days before today are left out, a week wholly
  past is `past_day`), and whether to share out the pool, give backlog work a day and bring in overdue work. The days'
  untimed work stays on its day; the pool, backlogs and overdue work go to a day and a person. The AI
  (`PlannerAi::planWeek`, spend `time_week_plan`) proposes `{task_id, date, person}`; each line is checked (the day is
  one of the week's, the person is in scope, works that day, may take the task's type, has room); what fails goes to
  the rules (a task with an owner stays theirs, an urgent one goes to the earliest day it fits, the rest to the day with
  most room; reasons `their_own`, `earliest_day`, `most_room`). Then each day is timed by `DayPlanner::merge` as a day
  plan is. The answer is grouped by day with each person's capacity and free time before the plan; nothing is written
  until `time/plan/apply`, whose lines may now carry their own `date` (never a past one). The Planner's week view shows
  "Plan the team's week with AI" / "Plan my week with AI"; the dialog offers this week (from today) or the next, the
  next first when two days or fewer are left.
- **The assistant** (`POST time/assistant`, `Assistant`, throttle 30/min, spend `time_assistant`, `/time/assistant`):
  a conversation (the last 12 messages, 4,000 characters each, kept in the browser's session only). Claude answers with
  read-only tools — `get_day`, `get_week`, `get_pool`, `get_people`, `get_learning` (a staff member's own figures
  only), `get_insights`, `find_tasks` — up to 6 rounds, the last without tools, and proposes changes through
  `propose_changes` (`create_task`, `assign`, `move`, `set_length`). Each change is checked against the asker's rights
  (`PlanningMode`, skills, past days, the task existing in this organisation) before it is shown; a refused one goes back
  to Claude with the reason. A shown change carries the full admin's own planner call (`POST planner/tasks`,
  `PATCH planner/tasks/{id}/move`, `PUT planner/tasks/{id}`), which the page sends when the person presses Apply —
  so the planner's own endpoints decide again.
- **The coach** (`/time/coach`, `GET time/coach?weeks=`, everyone; `POST time/coach/strategy` and `time/coach/draft`,
  a manager's, throttle 10/min each, spend `time_coach`, `time_draft`): readiness (`AiReadiness`: the business, house
  rules, type notes, people's titles or knowledge, skills, hours, 20 finished tasks, 30 % clocked — a score and a
  checklist with the way to each gap); the overview's figures (a staff member sees their own); the strategy (at most
  eight recommendations with impact and kind; a `fix` the server checked — a typical length for a type or task that
  exists, or a type added to a person who has a skills list — applied with one press through the setting's and the
  Team endpoint's own writers, read afresh first); task lengths planned against real with "Use <length>" (writes the
  typical length); people (who leads each type and who could use support; each person's figures by type); and, a
  manager's, **Teach the AI**: the business, every type's and task's note, typical length and best time, and the
  people's titles, knowledge, strengths and development. "Draft with AI" fills the form (business, types and tasks) or
  lists people's drafts to save one by one (`PUT time/people/{user}`, only what the AI wrote); nothing is saved until
  the manager saves, and a save changes only the rows touched, over the notes as they are now.
- **Everywhere the AI plans** — the day plan, the week plan, the assistant — it now reads the business, the type and
  task notes and the people's titles, levels, strengths and development (`AiFacts`), and every candidate is sized by
  `Learning::size`.

## The areas

| Area | Address | What it does |
|---|---|---|
| My day | `/time` | greeting, quick add (type, With AI, Speak), figures, now / up next with Start / Pause / Finish, my day on the clock (press an hour to add, drag to move), without a time, AI briefing, heads-up, overdue (to today), from the pool (Take), my week, the day's note; "Plan my day with AI" |
| Planner | `/time/plan` (`?date=`, `?view=week`, `?person=`, `?all=1`) | the day as lanes of hours per person (drag to another time or person; drop untimed work on an hour), signals, AI review of the day, the day's note; the week as people × days (drag between cells; one press on a cell's empty space, or its "+ Add", adds a task for that person and day — always shown on a touch screen); "Plan the team with AI" (whoever may plan for others), "Plan my day with AI"; in the week view "Plan the team's week with AI", "Plan my week with AI" |
| Backlog & pool | `/time/backlog` (`?tab=mine|pool|team`) | my bucket, the open pool by horizon (take, plan for today or tomorrow), the team's buckets (manager) |
| Team & skills | `/time/team` | each person's hours, days, break, skills, preferred work, knowledge, shown experience and today's load; a manager edits the profile |
| AI assistant | `/time/assistant` | ask about days, weeks, the pool and the team; proposed changes applied one by one or all at once; what the AI knows (readiness) |
| AI coach | `/time/coach` (`?tab=overview|durations|people|knowledge`, `?weeks=4|8|12|26`) | readiness, the period's figures, the AI strategy with one-press fixes, task lengths planned against real, people by type, Teach the AI (a manager's) |
| Insights | `/time/insights` (`?range=`, `?from=`, `?to=`, `?person=`, `?tab=`) | figures with the trend, people, work by type, weekday and hour, days, pool aging, signals, AI review of the period |
| Settings | `/time/settings` (`?tab=day|planning|types|tasks|templates|account`) | the working day, who plans whose day (the planning mode), task types, tasks, templates (shared with the full admin) |

**The task form** (`task/TaskPanel.tsx`, 9 Nov round 3, the owner: "make something like we have before with icons, and
the tasks shown after type selection as a grid"): the full admin's drawer's pickers — the types as a grid of tiles with
their icons and colours (no type last, "Custom"), then the chosen type's tasks as a grid (a task tagged with types only
under those, an untagged one under every type), an amber dot on what fits the chosen person (their preferred work), the
templates as a list that opens above the types (`task/TaskPickers.tsx`, decisions in `task/taskFormLogic.ts`). Then the
title (focused; a task picked fills an empty one, never one the person typed; Enter adds), who, the day and the rest. "Add
& next" adds the task and keeps the panel open for the next one of the same day, person and type.

Find (⌘K / Ctrl K): add a task, add with AI, plan my day, a person's day, the areas. Keys: N new task, A add with AI,
P Planner, B Backlog, ? shortcuts.

## Rules the code keeps (and the tests that keep them)

- **The gates**: every `admin/time/*` route carries `workspace:time`, every one but the bootstrap
  `feature:time_management` (`tests/Feature/TimeWorkspace/GateAndBootstrapTest.php`).
- **Reads write nothing; a plan writes nothing until applied** (`PlanTest`), a capture nothing (`CaptureReviewVoiceTest`).
- **The AI's lines are checked** (overlap moved, a person past their skills or without an account refused, unknown
  tasks dropped, before now moved) and the allowance stops it before the provider (`PlanTest`, `CaptureReviewVoiceTest`).
- **Another organisation's tasks never show or move** (`DayBoardTest`, `PlanTest`, `ClockAndInsightsTest`).
- **Days are the venue's** (Riga's 12:00 at 10:00 UTC; on-time judged in the venue's zone) (`DayBoardTest`,
  `ClockAndInsightsTest`).
- **The AI assistant** (2026-11-14): knowledge cleaned and saved by a manager only, learning and readiness figures,
  sizes, a staff member's own figures only (`KnowledgeLearningTest`); the week plan's checks, rules, reasons, dated apply
  and the planning mode (`WeekPlanTest`); the assistant's tools, checked proposals and refusals, the coach's strategy
  fixes and drafts (`AssistantCoachTest`); frontend `coach/coach.test.ts`, `coach/CoachPage.test.tsx`,
  `plan/plan.test.ts` (week lines, day load, which week).
- **The planning mode** on the full admin's planner endpoints and the workspace's, a manager's choice, `team` by default
  (`PlanningModeTest`, `SettingsTest`, `GateAndBootstrapTest`; frontend `time/lib/rights.test.ts`,
  `settings/SettingsPage.test.tsx`).
- **The module**: its own product, packages and access (`tests/Feature/AdminAccess/TimeModuleAccessTest.php`,
  `tests/Unit/Support/PlanModulesTest.php`, `tests/Feature/Auth/PlanModulesControllerTest.php`; frontend
  `pages/productSignup.test.ts`, `workspace/lib/landing.test.ts`).
- **Frontend**: only `a-*` and `time-*` classes, only the listed areas, nothing from another workspace
  (`time/tokens.test.ts`); every word in five languages (`time/i18n/timeLocales.test.ts`); palette pinned
  (`time/theme/timeContrast.test.ts`); decisions in pure functions with tests (`*Logic.ts`, `timeline.ts`).

## Changed beside the workspace

- `PlannerController::resolveWorkWindow` and `hhmmToMin` now call `App\Services\Time\WorkWindow` (the same rule, moved).
- `PlannerController::copyTask` leaves the clocked time out of a copy.
- `PlannerTask`'s saving hook stops a running clock when a task becomes done.
- `ChatInboxController::transcribe` calls `App\Services\Ai\SpeechToText` (the same rule and answers, moved).
- Migration `2026_11_09_100000_add_time_planner_columns` (three nullable columns).
- 2026-11-09, the module and the planning mode: AccessMap `admin/planner` and `admin/planner-presets` are product `time`
  (a full customer reaches every product as before); `PlannerController`'s writers ask `PlanningMode` (in `team` mode,
  the default, nothing changes for anyone).

## Known limits

- The planning mode is chosen in the Time Planner's Settings only; the full admin's Settings → Planner does not show it
  (its Planner follows it, and says the server's sentence when a change is refused).

- The assistant's conversation lives in the browser's session (it is not kept on the server); a new tab starts afresh.
- Learning needs finished work, and real lengths need clocked work (3 per type or task); until then the planned length
  stands in and the coach says so.
- A week plan places at most 120 tasks (`WeekPlanner::MAX_TASKS`: the days' own untimed work first, then the pool,
  backlogs and overdue work, each read 300 at most).
- The full admin's own Planner does not show clocked time yet (its Stats count planned minutes as before).
- Planning reads at most 60 tasks per plan, a period at most 92 days, overdue work 30 days back.
- The AI and voice need the server's `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`; without them the rules plan and the
  microphone is hidden.
