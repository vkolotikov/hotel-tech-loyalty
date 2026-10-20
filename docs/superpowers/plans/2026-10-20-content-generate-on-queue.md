# HexaTech Content — Generate on the Queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate (a week or more of AI posts) runs as a queued job, so production's 60 s request limit no longer cuts it off; the dialog and the Plan show it running and fill in when it is done.

**Architecture:** `POST generate` validates, takes the brand's generation lock in the shared cache, records a "running" state, dispatches `GenerateContentCalendar`, and answers the state as it is after the dispatch: 202 `running` on the production queue, 200/503 with the finished result where the queue is `sync` (tests, local). `GET generate` answers the brand's current state. The job runs the existing service, records the result, releases the lock. The portal polls `GET generate` every 4 s while a run is running — in the dialog and, once it is closed, from the Plan — and reads the plan again when it ends.

**Tech Stack:** Laravel 13 / PHP 8.4 (database queue, `App\Support\SharedCache`), React 19 + TanStack Query, five i18n bundles.

**Spec / authority:** the owner's "do all remaining steps and what all need to do" (2026-10-20); evidence: one week of generation took 65.7 s locally; production's request limit is 60 s (Laravel Cloud maximum). Content spec 2026-10-14 §6.6 (Generate) stays the behaviour.

## Global Constraints

- PHP `/c/wamp64/bin/php/php8.4.20/php.exe`; scoped test runs; frontend `npx tsc -b`, vitest baseline 3 `plannerMeta` failures, lint baseline 17.
- Everything a job and the web app both read lives in `SharedCache` (production's default cache is per container).
- Words in all five bundles; refusal words in `lib/errors.ts`.
- Deploy by the source-patch recipe under the standing go; no migration.

## Review Focus

1. A run whose job never finishes (worker restarted mid-run): the state must not say "running" forever — after the run's time is up it reads as failed and a new run may start.
2. Two managers pressing Generate at once: one runs, the other is told one is already running (409 `already_generating`).
3. Fill with AI while Generate runs (or the reverse): refused with `already_generating`, as before — the lock is shared between containers.
4. The dialog closed while running: the Plan still fills in and says how many posts were written.
5. Where the queue is `sync` (tests, local `QUEUE_CONNECTION=sync`), `POST generate` still answers the finished result at once.

### Task 1: Server — run state, shared lock, job, endpoints

**Files:** create `app/Services/Content/ContentGenerationRun.php`, `app/Jobs/GenerateContentCalendar.php`; modify `app/Services/Content/ContentAiGate.php`, `app/Http/Controllers/Api/V1/Admin/Content/GenerationController.php`, `routes/api.php` (one `GET generate` route); test `tests/Feature/Content/GenerateTest.php`.

- `ContentAiGate`: the generation lock moves to `SharedCache::store()->lock(...)`; new `startGeneration(int $orgId, int $brandId): string` (the lock owner; refuses `already_generating`) and `endGeneration(int $orgId, int $brandId, string $owner): void` (`restoreLock(...)->release()`); `RUN_SECONDS = 660` for a queued run.
- `ContentGenerationRun` (shared cache, key `content:generation:{brandId}`): `running(int $brandId, int $userId, string $from, string $to)`, `finish(int $brandId, array $result)` (post ids, skipped, failed windows, status completed/partial/failed), `fail(int $brandId, string $code)`, `describe(int $brandId): array` → `{status: idle|running|completed|partial|failed, ...}`; a `running` state older than `RUN_SECONDS` describes as `failed` with code `generation_failed`.
- `GenerateContentCalendar` (tries 1, timeout 600): binds the tenant, runs `ContentCalendarGenerationService::generate`, `finish` or `fail` (no_channels / generation_failed), always `endGeneration`; `failed()` records `generation_failed` and releases.
- Controller: validation and refusals as today; `no_channels` checked before dispatch; `startGeneration`; `running`; dispatch; answer `describe()` — 202 while running, 503 when failed with no posts, else 200.
- Tests (RED first): running answer 202 with `Queue::fake()`; `GET generate` running/finished/idle; a second Generate while running → 409; Fill while running → 409; a stale running state reads failed and lets a new run start; a job that throws records `generation_failed` and frees the lock; the existing tests still pass on `sync`.

### Task 2: Portal — running state in the dialog and the Plan

**Files:** `frontend/src/content/lib/types.ts`, `lib/api.ts`, `plan/GenerateDialog.tsx`, `plan/PlanPage.tsx`, a pure `plan/generateRun.ts`; the five bundles; tests `plan/generateRun.test.ts`, `plan/generateDialog.test.tsx` (or the existing dialog test).

- `GenerateRun` type; `api.generation()`; `api.generate` returns the run (`running` or finished).
- A shared query `['content', brand, 'generation']` refetching every 4 s while `running`; `runEnded(prev, next)` pure helper.
- Dialog: after Generate, `running` shows "The AI is writing your posts. This can take a minute or two — you can close this: the plan fills in when they are ready." (live region), with Close; a finished run shows today's result view.
- Plan: while a run is running, a line "The AI is writing posts…"; when it ends, the plan is read again and the note says "Posts written: N" (or the failure words).
- Words: `generate.running`, `plan.generating` in five languages.

### Task 3: Release checks and deploy

- PHP folders by path; vitest/tsc/lint; eyes at 1440/390 (running state simulated through the shared cache; one real run locally with `QUEUE_CONNECTION=sync`); fresh Opus review + one fix pass; deploy by the source-patch recipe; verify by content (`GET /api/v1/admin/content/generate` 401 signed out; ContentApp carries the running words).
