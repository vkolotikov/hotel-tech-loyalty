# HexaTech handoff — 28 November 2026 (Time Planner: the AI's look and motion; recognition; buddies)

Three rounds on this day: the AI's look and motion (below, deployed at midday), **recognition** — points, badges and
the week's ranking — and **buddies**, the animated characters, at the end of this file.

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

### Deploy (28 Nov, 14:34 UTC)

- Production **2051b621** by the source-patch recipe on `origin/main` **c1244823** (its CI green; nothing landed while
  the round was built): source patch **74d979c2** — the merge-base `c1244823` to the branch's **1d9797cc**, 55 files (18
  added, 37 changed, none deleted: `frontend/src/time/**`, six server files — `Recognition`, `WorkWindow`, `DayBoard`,
  the workspace's `WorkspaceController` and `SettingsController`, `routes/api.php` — `RecognitionTest`, the runbook,
  `CLAUDE.md` and this handoff). Parity: the artifact's source equals the branch tip, file for file. Fresh build
  **2051b621**. No migration.
- **On the artifact**: the scoped PHP sweep — every `tests/Feature/*` and `tests/Unit/*` directory and file, one run
  each — **8,059 passed, none failed** (the usual skips: Auth 6, Booking 6, Content 3, CrmWorkspace 1, Dashboard 1,
  LoyaltyWorkspace 1, Stripe 7, `LeadIntakeApiTest` 6), with TimeWorkspace 74, AdminAccess 95, Planner 59, Security
  11, Unit/Support 221; TimeWorkspace 74 again on PostgreSQL; `tsc -b` clean; lint baseline passed (1,377 legacy, none
  new); **Vitest 503 files / 7,450 tests**; `npm run build`; the built SPA served by `php artisan serve` shows the
  band, a real celebration from the built bundle (the points floating, a badge card with 44 pieces of confetti
  falling and the medal's light passing), Achievements in the default choice (the top three and "and 2 more
  colleagues" for staff, all five for the manager), Settings → Recognition, and the earlier rounds' pages.
- **Live by content** (14:38 UTC, three minutes after the push): `index-aqnBN5Mw.js` → `TimeApp-DiVmk98O.js` ("See
  achievements": the celebration in the shell) → `WinsPage-B7UvrOMP.js` ("It starts again every week", "How points are
  earned"); `SettingsPage-BjGTBjj3.js` holds `planner_recognition`; `index-B_q5Q-xt.css` holds `time-confetti`,
  `time-gold-hi` and fifteen `time-*` keyframes (ten before); `/time`, `/time/wins`, `/time/settings`,
  `/time/assistant`, `/time/register` 200; `api/v1/admin/time/recognition` 401 without a login (404 before the
  release); `hexa-academy` 200, its kit 64,577 bytes.
- CI on 2051b621: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/46155360540 — **green** (14:50 UTC).
- The branch was brought up to main again by a merge (`968e6acb`, its tree main's own), so the **next source-patch
  baseline** is `git merge-base origin/main HEAD` = `2051b621`.

## Third round: buddies (the animated characters)

### The owner's request

"Lets add maybe some animated characters as well or smth to make it even more interesting."

### What was built

Runbook: `docs/time-planner-workspace.md`, "Buddies: the animated characters (2026-11-28)"; the code rules are a
bullet of `CLAUDE.md`'s Time Planner section.

- **Four characters of our own drawing** on one SVG rig (`frontend/src/time/wins/Buddy.tsx`): Hexi (a hexagon in the
  organisation's colour), Pip (a sprout), Miu (a cat) and Ember (a flame). Each has five moods read from the person's
  day — asleep with nothing planned, ready, busy, proud at the daily goal, a party when everything is done — and the
  week's leader wears a crown.
- **Where they are**: inside the daily goal's ring on My day and on Achievements (there the day's sentence is what
  the character says, in a speech bubble); the team's characters on the podium and beside the names in the ranking; on
  the celebration card holding the medal, and for the big moments coming up from the foot of the screen; a card
  **Your buddy** on Achievements where each person picks one, or none.
- **Server** (`App\Services\Time\Buddies`): a person's choice is `staff.planner_profile.buddy`, written only through
  `PUT admin/time/buddy` (`PlannerProfiles::chooseBuddy`, the one field of a profile a person writes for themselves;
  a manager's save of the rest keeps it); someone who never chose is given one by their account, so a team is varied
  from the first day. Recognition answers each person's character. No migration.
- **The organisation's switch**: Settings → Recognition → Animated characters (`planner_buddies`, on unless a manager
  switches it off): off, nobody is shown or offered a character; points and badges stay as they are.

### Decisions worth knowing

- Everyone has a character from the first day (by their account) rather than an empty place until they choose; a
  person who wants none picks "No character", and a manager can switch them off for the whole organisation.
- A person's choice is kept on the server with their profile, so colleagues see it and it follows them to every
  device. It is not audited (it changes what nobody may see or do).
- The characters are decoration: nothing is read out for them, and what a mood means is always said in words too.
- The workspace shows characters only where the server's answer says so, so nothing is offered that could not be
  saved while a release is under way.

### Checks (this container, 28 November)

- **PHP**: `BuddiesTest` 6 tests / 70 assertions; `tests/Feature/TimeWorkspace/` 80 passed on SQLite and on
  PostgreSQL; AdminAccess 95 (the new route has its key), Planner 59; Larastan clean on `app/Services/Time` and the
  workspace's controllers.
- **Frontend**: `tsc -b` clean; lint baseline passed (1,377 legacy, none new); **Vitest 504 files / 7,481 tests**
  (new: `wins/buddy.test.tsx`; additions in `wins/WinsPage.test.tsx`, `settings/SettingsPage.test.tsx`,
  `lib/rights.test.ts`, `theme/timeContrast.test.ts`, `i18n/timeLocales.test.ts`); every word in five languages.
- **Real browser** (the Riga demo; 1440 Dark and Light, 390 Light): every character in every mood on a sheet, large
  and small (the blink, the wave and the hop caught in the act); My day's ring and Achievements with the team's
  chosen characters; a staff member choosing Hexi (the ring, her row and the card follow, and choosing celebrates
  nothing); finishing her day — the character on each card holding its medal, crowned when she took the lead, and the
  cameo coming up and going; the manager's switch off (no character, no choice, no bubble, initials on the podium)
  and on again; with **reduced motion** the characters at rest in their pose, no cameo, no confetti. No console error,
  failed request or sideways scroll at 390 px.
- Found and fixed on the way: a manager's save of a person's profile would have dropped their character (the profile
  is rebuilt from its known fields; `buddy` is now one of them, pinned by a test); the cat's first name read as "whale"
  to a Russian speaker (it is Miu); the ranking showed characters even where the answer said the organisation shows
  none.

## What the owner does by hand

Nothing. To open the whole ranking to the team, to change the daily goal, or to switch the characters off: Time
Planner → Settings → Recognition. Each person picks their own character on Achievements.

## Left open

- The assistant's answer is written out by the page after it arrives whole; streaming it from the server as the AI
  writes would need a streaming endpoint (not built).
- The full admin's own Planner is unchanged (no motion there, and nothing of recognition).
- Recognition has no history beyond what the tasks say: no hall of fame of past weeks, no monthly ranking, no prizes
  attached to points. Each would need something stored (and a decision on what a task un-done does to it).
- A celebration needs the page open; nothing is pushed to a phone when a colleague takes the lead.
