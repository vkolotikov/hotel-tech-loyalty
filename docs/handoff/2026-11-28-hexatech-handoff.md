# HexaTech handoff — 28 November 2026 (Time Planner: the AI's look and motion; recognition)

Two rounds on this day: the AI's look and motion (below, deployed at midday) and **recognition** — points, badges and
the week's ranking — at the end of this file.

Previous state for the Time Planner: `2026-11-14-hexatech-handoff.md` (the AI assistant, deployed). Other sessions'
handoffs run to `2026-11-27-hexatech-handoff.md` (CRM, dashboards, booking). Branch `ccr-e74852c3-mco7tm`. Runbook:
`docs/time-planner-workspace.md`, section "How the AI's screens look and move (2026-11-28)".

## The owner's request

"I want you to review one more time our ai planner functionality, easy to use and modern easy to use design, maybe add
some modern, animated features etc." Standing word: deploy when done.

## The branch was brought up to main first

Main had moved 147 commits since the Time Planner's last deploy (CRM dashboards, booking, the shared frame). The branch's
own work was already on main (source-patch deploys), so it was brought up to main by a **merge** — `0477021b`, whose tree
is main `fefe2ca1` plus the 14 Nov handoff's two post-deploy notes (a force-push that would have restarted the branch
was refused, rightly; the automatic merge had duplicated the Time Planner's route block in `routes/api.php`, and main's
version of that file was taken). So from this round on: **the source-patch baseline is the merge-base with main**
(`git merge-base origin/main HEAD`), and the change list is `git diff --name-only <that> HEAD`. The earlier baselines
(`bc410bd`, `3ca87339`, `7f2dc364`) are history. After the merge: `composer install` (with `php8.5`; plain `composer`
runs PHP 8.3 and refuses main's lock) and `npm install` in `frontend/`; the demo database took main's 22 new migrations.

## What was reviewed and built (frontend only; no server change)

Every AI surface was looked at in a real browser on current main. They worked but were static: waiting was a spinner,
answers arrived at once, figures were plain text, and the AI's functions were spread over five places.

- **The assistant**: starter cards under an animated orb; a thinking state (orb turning, lines shimmering); a fresh
  answer writes itself out; under it what the AI looked at, the proposed changes as cards (applied one after another,
  each then with "Open the day"), copy, and follow-ups; a box that grows; a gauge for what the AI knows; an **AI tools**
  list (plan my day, plan the week, add with AI, review, coach) so everything is one press away.
- **Ask from anywhere**: Find's "Ask the AI: …" for anything typed, and an ask box on My day; both open the assistant
  with the question asked (`?q=`).
- **Plan dialogs** (day and week, now sharing `plan/PlanParts.tsx`): an animated planning view, a summary with All /
  None, load bars per person (week), lines appearing one by one, a folding "not planned" list.
- **The coach**: readiness as a filling ring, counting figures, a skeleton while the strategy is written, Task lengths as
  planned-against-real bars, AI-drafted fields marked in Teach the AI.
- **Review card and "Add with AI"**: the same waiting and arriving motion.
- **Motion rules**: `time-*` classes and keyframes in `theme/time.css`; everything stops under reduced motion (the
  frame's rule for elements, the stylesheet's own block for pseudo-elements, `motionOk()` for script).

## Checks (this container, 28 November)

- `tsc -b` clean; lint baseline passed (1,377 legacy, none new); **Vitest 501 files / 7,385 tests** passed (new:
  `lib/motion.test.ts`, `assistant/Answer.test.tsx`, additions in `coach/coach.test.ts`, `plan/plan.test.ts`,
  `coach/CoachPage.test.tsx`, `tokens.test.ts`, `timeLocales.test.ts`); every new word in five languages.
- **Real browser** on a freshly seeded Riga demo with the local stand-in for the AI service (now with a delay, so the
  waiting states can be seen, and answers for the day plan, the review and capture): manager and staff, 1440 Dark and
  390 Light. The assistant from empty to applied (2 changes saved, 2 "Open the day" links), Find and My day handing a
  question over, both plan dialogs (waiting, result, All / None), the coach (ring, strategy waiting and result, bars,
  drafted fields), the review card and capture. No console error, failed request or sideways scroll. With **reduced
  motion**: the orb's halo is `animation: none`, the ring's fill is instant, an answer is whole at once (no caret).
- Found and fixed by eye: the start screen's glow showed its box's edge; on a phone the empty conversation opened
  scrolled to its end (the orb out of sight) and the box to write in was below the fold; a change card's icon sat alone
  on its own line at 390 px; the Task lengths bars were too short.

## Deploy (28 Nov, 12:44 UTC)

- Production **a41f0deb** by the source-patch recipe on `origin/main` **fefe2ca1** (its CI green; nothing landed while
  the round was built): source patch **313f375a** — the merge-base `fefe2ca1` to the branch's **2bcb6191**, 66 files (9
  added, 57 changed, none deleted: `frontend/src/time/**`, the runbook, `CLAUDE.md`, this handoff and the 14 Nov
  handoff's two post-deploy notes). Parity: the artifact's source equals the branch tip, file for file. Fresh build
  **a41f0deb**. No server file changed.
- **On the artifact**: TimeWorkspace 63, AdminAccess 95, Unit/Support 221, Planner 59 passed; `tsc -b` clean; lint
  baseline passed (1,377 legacy, none new); **Vitest 501 files / 7,385 tests**; `npm run build`; the built SPA served by
  `php artisan serve` renders the assistant, the coach, Task lengths, the week plan from Find's address and My day's ask
  box, with the orb and the ring animating (`time-spin`, `time-ring`) and all ten `time-*` keyframes in the built CSS.
- **Live by content** (12:48 UTC): `index-CGXgnBFS.js` → `TimeApp-0CkLeFyJ.js` ("Ask the AI: ") →
  `AssistantPage-CuT_-U61.js` ("Looked at", "AI tools"); `index-BrZwK6Dt.css` holds `time-orb` and the ten keyframes;
  `/time`, `/time/assistant`, `/time/coach`, `/time/plan`, `/time/register` 200; `api/v1/admin/time/assistant` 401
  without a login; `hexa-academy` 200, its kit 64,577 bytes.
- CI on a41f0deb: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/46146185463 — **green**.
- **Follow-up the same hour** (13:04 UTC), found on the released screens at 1440 px: in Task lengths the suggested
  length, "Written down" and the "Use …" buttons broke onto two lines (the new bars took two fifths of the table). The
  bars take a third and figures and buttons never wrap; checked at 1440 and 1280 in English and German (no wrapped
  button, rows one height) and at 390 (the table scrolls inside its card). Production **c1244823** on a41f0deb: source
  patch **e6ff512a** (2bcb6191..0782469a: `coach/CoachSections.tsx` and this handoff), artifact source equal to the
  branch tip, `tsc -b`, lint, Vitest 501 files / 7,385 tests, build, the built pages rendered. Live by content (13:08
  UTC): `index-kQF8dwSG.js` → `TimeApp-_pCvoYW_.js` → `CoachPage-DROhttim.js` (`min-w-[56rem]`, the bars' `w-1/3`).
  CI on c1244823: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/46147810476 — **green**.
- **Next source-patch baseline**: `git merge-base origin/main HEAD` (the branch contains main since the merge).

## Second round: recognition (points, badges, the week's ranking)

### The owner's request

"Lets add some animated stimulus to employees, like badges or something else interesting when they finish important
tasks, finish day minimum tasks, do more than others, fill calendar etc. make same week rating system or smth. Make it
interesting so they are interested to fill and do tasks."

### What was built

Runbook: `docs/time-planner-workspace.md`, "Recognition: points, badges and the week's ranking (2026-11-28)"; the code
rules are a bullet of `CLAUDE.md`'s Time Planner section.

- **Server** (`App\Services\Time\Recognition`, `GET admin/time/recognition`, two settings through the workspace's own
  `PUT admin/time/settings/…`): points for a finished task (length, high priority, on time, timed) and for a day (the
  daily goal, a clean sweep, a filled calendar), the streak, ten badges, the week's ranking. **Nothing is stored**: it
  is read from the planner's tasks each time, so a task set back takes its points with it. No migration.
- **My day**: a band with the daily goal as a ring, what earns the next points, today's and the week's points, the
  place, the streak, the calendar's fill and the week as seven dots.
- **Achievements** (`/time/wins`, new in the menu under My day): my week, each day as a bar, the ranking with a podium,
  my badges with their progress, how points are earned.
- **Celebrations**: a card (with confetti for the big moments) when the server's next answer shows something earned —
  a new badge, taking the lead, a clean sweep, the daily goal, a well-planned day, an important task — and a floating
  "+N points" for a plain task. Nothing on the first answer of a session, nothing for points lost; no confetti with
  reduced motion.
- **Settings → Recognition** (a manager's): who sees the ranking, and the daily goal.

### Decisions worth knowing

- **Where nobody chose, staff see the top three and their own place** (`podium`), not the whole table: the best are
  celebrated and everyone knows where they stand, but no organisation gets its last places shown to the whole team by a
  deploy. A manager opens the whole table (or closes it further, or switches recognition off) in Settings →
  Recognition; a manager always sees the whole table.
- Only finished work is counted and shown; nobody's late or unfinished tasks appear to anyone.
- The daily goal is 3 finished tasks unless a manager changes it (1 to 20); a day of few long tasks reaches it by
  finishing everything on a well-filled day.
- Achievements is in the phone's menu, not its top bar (the bar is full at 360 px); My day's band leads to it.
- The gold of the light theme is a fill from a light gold to a deep one (`--time-gold-hi` → `--time-gold`), so a medal
  reads as gold on a white page and still stands 3:1 off it.

### Checks (this container, 28 November)

- **PHP**: `RecognitionTest` 11 tests / 112 assertions; `tests/Feature/TimeWorkspace/` 74 passed on SQLite and on
  PostgreSQL (`scripts/test-pg.sh hexa_test`); Larastan clean on the changed files.
- **Frontend**: `tsc -b` clean; lint baseline passed (1,377 legacy, none new); **Vitest 503 files / 7,449 tests**
  (new: `wins/wins.test.ts`, `wins/WinsPage.test.tsx`; additions in `settings/SettingsPage.test.tsx`,
  `lib/rights.test.ts`, `theme/timeContrast.test.ts`, `i18n/timeLocales.test.ts`); every word in five languages.
- **Real browser** (the Riga demo, five people with a week of finished work; 1440 Dark and Light, 390 Light and Dark):
  the band, Achievements and Settings → Recognition; a staff member finishing her day through the page — "+11 points",
  "New badge: Priority hero" (with "Important task done" named on it), "Daily goal reached!" with a five-day streak,
  "New badge: Right on time" with "You lead the week!" named on it, "Clean sweep!" — each with the server's own
  points; the lead and the well-planned day as cards of their own from crafted answers; points lost celebrate
  nothing. The manager switching each choice in Settings and the staff member's pages following: the top three and
  "and 2 more colleagues", the private note without any place and without the two place badges (a manager still seeing
  all five), switched off (Achievements out of both menus, no band, the page saying so), and the daily goal up and
  back. With **reduced motion**: the card without confetti, the points standing still, the medal's light stopped. No
  console error, failed request or sideways scroll at 390 px.
- Found and fixed on the way: the ink on gold was 4.42:1 in the light theme (now 4.85:1, and the palette test holds it
  to 4.5:1); the light theme's flat gold read as brown; the ranking card had half a screen of empty space beside the
  badges (the rules moved under it); a row of the ranking counted fewer badges than the person's own page (last week's
  places are now counted in both); a lead that came together with a badge was not said (the card now names what else
  came with it); the goal's ring read "5/3" once more was done than the goal names (a tick now).

## What the owner does by hand

Nothing. To open the whole ranking to the team, or to change the daily goal: Time Planner → Settings → Recognition.

## Left open

- The assistant's answer is written out by the page after it arrives whole; streaming it from the server as the AI
  writes would need a streaming endpoint (not built).
- The full admin's own Planner is unchanged (no motion there, and nothing of recognition).
- Recognition has no history beyond what the tasks say: no hall of fame of past weeks, no monthly ranking, no prizes
  attached to points. Each would need something stored (and a decision on what a task un-done does to it).
- A celebration needs the page open; nothing is pushed to a phone when a colleague takes the lead.
