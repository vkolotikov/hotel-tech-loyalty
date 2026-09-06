# HexaTech (standalone `Hexa-Tech` repo) — instructions for Claude Code

Multi-tenant Laravel 13 + React (Vite, TypeScript) SaaS with four sub-brands. Production deploys from
`hotel-tech-loyalty:main` on Laravel Cloud. Landing-page builder docs: `docs/landing-page-builder.md`
(read it before touching anything under `app/Landing`, `resources/views/landing`, `public/landing`,
`frontend/src/pages/landing`).

## Environment (hard rules, each one has bitten before)

- PHP: always `/c/wamp64/bin/php/php8.4.20/php.exe`. The `php` on PATH is 8.3 and silently breaks JSON
  request bodies in tests.
- NEVER run a bare `php artisan test` — it segfaults. Scope every run:
  `artisan test tests/Feature/Landing/`, `tests/Unit/Landing/`, `tests/Unit/Support/` (and the other suites
  by directory). Run in the foreground and read the `Tests:` summary line yourself.
- `php artisan view:clear` after every Blade change before testing.
- Frontend: `cd frontend && npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing).
  Run `npm install` after pulling; the build model commits `frontend/dist` + `public/spa`
  (`npm run build` → `scripts/postbuild.mjs`).
- Windows shell: Git Bash for POSIX scripts, PowerShell 5.1 otherwise. Prefer the Edit tool over
  `python -c`/`sed` for file changes (CRLF and cp1252 hazards). Bash heredocs mangle long markdown —
  use the Write tool for documents.
- Disk on `C:` fills up fast from other tools on this machine; report `ENOSPC` instead of deleting things.
- Never junction `vendor` into a git worktree (PHPUnit then tests the wrong tree); remove junctions with
  `cmd /c rmdir` before `git worktree remove`.

## Git and deploy

- Work on a feature branch. Never push a feature branch to `main`; never commit or push the feature branch's
  built `frontend/dist`/`public/spa`.
- Merging to `main` IS a production deploy (migrations run with `--force`, the SPA is rebuilt by Cloud).
  Use the source-patch recipe in `docs/landing-page-builder.md` §6: separate worktree from `origin/main`,
  apply the change list including deletions, tests on the artifact, fresh build, push, verify by content.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (or the current
  model's name).
- `feature/landing-phase-3c` carries three unshipped non-landing commits (email compliance); do not let
  them ride a landing deploy by accident.

## Landing-page code rules

- One source of truth: the server serves the section catalogue; the editor derives from it. No mirrored
  lists in TypeScript. New leaf = catalogue entry + label in all five locales.
- Blade: `{{ }}` only. No inline styles or scripts (CSP). Kit stylesheets ship verbatim; only our appended
  block after the author's CSS may change, and the per-template test proves it.
- Images have one writer (the media endpoints). Local dev never writes to the production bucket:
  `MEDIA_DISK=public`, `DO_SPACES_*` commented out.
- Booking is gated on capability (`PageContent::bookingMode()`), not on industry.
- Verify page work with your eyes first (real browser screenshot at 1440 against the author's original),
  tests second.

## Secrets

Never echo credential values. `.env` is local; production settings live in Laravel Cloud.
