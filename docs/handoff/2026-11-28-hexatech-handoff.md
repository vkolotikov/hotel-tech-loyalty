# HexaTech handoff — 28 November 2026 (Time Planner: the AI's look and motion)

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

## Deploy

(recorded below once done)

## What the owner does by hand

Nothing.

## Left open

- The assistant's answer is written out by the page after it arrives whole; streaming it from the server as the AI
  writes would need a streaming endpoint (not built).
- The full admin's own Planner is unchanged (no motion there).
